-- Period summaries keep their narration (impl review F6): a newer entry without a narration (the cloud model failed,
-- or the lab lost its state file and rebuilt facts-only) updates nothing when the stored row has a narration, so a
-- facts-only push never clears a stored text. A newer narrated entry still replaces the row, and a facts-only entry
-- still replaces a facts-only row.
-- Design: context/changes/lab-period-summaries/reviews/impl-review.md (F6).

-- ingest_push is unchanged from 20261001094118_period_summaries.sql (its latest body) except that the
-- period_summaries upsert also skips a narration-less entry when the stored row has a narration.
-- Stores one v1 payload. POST /api/ingest validates it against the contract before this call; a
-- direct RPC call is not schema-validated, so the ingest token is the trust boundary.
-- Returns {"status":"created"} or {"status":"duplicate"}; raises P0401 for an unknown or revoked
-- token and P0409 when the same capture time arrives with different content.
create or replace function public.ingest_push(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_id bigint;
  -- jsonb text is canonical (sorted keys, no insignificant whitespace), so equal payloads hash equal.
  v_payload_hash bytea := extensions.digest(p_payload::text, 'sha256');
  v_source text := p_payload ->> 'source';
  v_captured_at timestamptz := (p_payload ->> 'captured_at')::timestamptz;
  v_push_id bigint;
  v_existing_hash bytea;
  v_recommendation jsonb := p_payload -> 'recommendation';
begin
  select t.id into v_token_id
  from public.ingest_tokens t
  where t.token_hash = extensions.digest(coalesce(p_token, ''), 'sha256')
    and t.revoked_at is null;

  if v_token_id is null then
    raise exception 'invalid ingest token' using errcode = 'P0401';
  end if;

  insert into public.ingest_pushes (source, captured_at, contract_version, payload_hash, payload, token_id)
  values (v_source, v_captured_at, (p_payload ->> 'contract_version')::integer, v_payload_hash, p_payload, v_token_id)
  on conflict (source, captured_at) do nothing
  returning id into v_push_id;

  if v_push_id is null then
    select p.payload_hash into v_existing_hash
    from public.ingest_pushes p
    where p.source = v_source and p.captured_at = v_captured_at;

    if v_existing_hash = v_payload_hash then
      return jsonb_build_object('status', 'duplicate');
    end if;
    raise exception 'capture time conflict' using errcode = 'P0409';
  end if;

  insert into public.daily_energy (day, pv_kwh, load_kwh, grid_import_kwh, grid_export_kwh, pv_forecast_kwh, captured_at, push_id)
  select
    (d ->> 'day')::date,
    (d ->> 'pv_kwh')::numeric,
    (d ->> 'load_kwh')::numeric,
    (d ->> 'grid_import_kwh')::numeric,
    (d ->> 'grid_export_kwh')::numeric,
    (d ->> 'pv_forecast_kwh')::numeric,
    v_captured_at,
    v_push_id
  from jsonb_array_elements(coalesce(p_payload -> 'daily_history', '[]'::jsonb)) as d
  on conflict (day) do update set
    pv_kwh = excluded.pv_kwh,
    load_kwh = excluded.load_kwh,
    grid_import_kwh = excluded.grid_import_kwh,
    grid_export_kwh = excluded.grid_export_kwh,
    pv_forecast_kwh = coalesce(excluded.pv_forecast_kwh, public.daily_energy.pv_forecast_kwh),
    captured_at = excluded.captured_at,
    updated_at = now(),
    push_id = excluded.push_id
  where public.daily_energy.captured_at <= excluded.captured_at;

  -- The contract keeps hour_start instants unique within a push, so no row is updated twice.
  insert into public.hourly_energy (hour_start, load_kwh, grid_net_kwh, pv_kwh, samples, captured_at, push_id)
  select
    (h ->> 'hour_start')::timestamptz,
    (h ->> 'load_kwh')::numeric,
    (h ->> 'grid_net_kwh')::numeric,
    (h ->> 'pv_kwh')::numeric,
    (h ->> 'samples')::smallint,
    v_captured_at,
    v_push_id
  from jsonb_array_elements(coalesce(p_payload -> 'hourly_history', '[]'::jsonb)) as h
  on conflict (hour_start) do update set
    load_kwh = excluded.load_kwh,
    grid_net_kwh = excluded.grid_net_kwh,
    pv_kwh = excluded.pv_kwh,
    samples = excluded.samples,
    captured_at = excluded.captured_at,
    push_id = excluded.push_id
  where public.hourly_energy.captured_at <= excluded.captured_at;

  -- Latest wins by built_at, so a late retry of an older push cannot replace a newer text, and an equal built_at
  -- (the lab re-sends a stored entry unchanged) rewrites the same values. A newer entry without a narration never
  -- clears a stored narration: it is skipped whole, so the stored facts stay with the text written from them. The
  -- contract keeps (kind, period) pairs unique within a push, so no row is updated twice.
  insert into public.period_summaries (
    kind, period, facts, narration_text, narration_generated_at, narration_provider, narration_model, built_at, push_id
  )
  select
    s ->> 'kind',
    s ->> 'period',
    s -> 'facts',
    s -> 'narration' ->> 'text',
    (s -> 'narration' ->> 'generated_at')::timestamptz,
    s -> 'narration' ->> 'provider',
    s -> 'narration' ->> 'model',
    (s ->> 'built_at')::timestamptz,
    v_push_id
  from jsonb_array_elements(coalesce(p_payload -> 'period_summaries', '[]'::jsonb)) as s
  on conflict (kind, period) do update set
    facts = excluded.facts,
    narration_text = excluded.narration_text,
    narration_generated_at = excluded.narration_generated_at,
    narration_provider = excluded.narration_provider,
    narration_model = excluded.narration_model,
    built_at = excluded.built_at,
    push_id = excluded.push_id
  where public.period_summaries.built_at <= excluded.built_at
    and (excluded.narration_text is not null or public.period_summaries.narration_text is null);

  if v_recommendation is not null then
    insert into public.recommendations (generated_at, language, text, provider, model, forecast, facts, push_id)
    values (
      (v_recommendation ->> 'generated_at')::timestamptz,
      v_recommendation ->> 'language',
      v_recommendation ->> 'text',
      v_recommendation ->> 'provider',
      v_recommendation ->> 'model',
      v_recommendation -> 'forecast',
      v_recommendation -> 'facts',
      v_push_id
    )
    on conflict (generated_at) do nothing;
  end if;

  delete from public.ingest_pushes where captured_at < now() - interval '14 days';
  delete from public.hourly_energy where hour_start < now() - interval '35 days';

  return jsonb_build_object('status', 'created');
end;
$$;

-- create or replace keeps the existing privileges; restated so the grants stay explicit.
revoke all on function public.ingest_push(text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_push(text, jsonb) to anon;
