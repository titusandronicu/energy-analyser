-- Push ingestion: the home lab pushes public-safe data to POST /api/ingest, which calls
-- public.ingest_push with the anon key. The function is the only anon entry point; every table
-- has RLS enabled and no client policies. Read policies are added by the slices that display data.

create extension if not exists pgcrypto with schema extensions;

-- Tokens are stored only as SHA-256 hashes. Several may be active at once so rotation is:
-- insert new -> switch the lab -> set revoked_at on the old one.
create table public.ingest_tokens (
  id bigint generated always as identity primary key,
  label text not null unique,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Raw pushes, kept 14 days (pruned by ingest_push) for debugging.
create table public.ingest_pushes (
  id bigint generated always as identity primary key,
  source text not null,
  captured_at timestamptz not null,
  contract_version integer not null,
  payload_hash bytea not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  token_id bigint not null references public.ingest_tokens (id),
  unique (source, captured_at)
);

create index ingest_pushes_captured_at_idx on public.ingest_pushes (captured_at);

-- One row per Europe/Warsaw calendar day, as sent by the lab. The row from the push with the
-- latest captured_at wins, so a late retry of an older push can't overwrite newer totals.
create table public.daily_energy (
  day date primary key,
  pv_kwh numeric,
  load_kwh numeric,
  grid_import_kwh numeric,
  grid_export_kwh numeric,
  captured_at timestamptz not null,
  updated_at timestamptz not null default now(),
  push_id bigint references public.ingest_pushes (id) on delete set null
);

-- One row per narrated recommendation; the first push carrying a given generated_at wins.
create table public.recommendations (
  id bigint generated always as identity primary key,
  generated_at timestamptz not null unique,
  language text not null,
  text text not null,
  provider text not null,
  model text not null,
  forecast jsonb not null,
  facts jsonb not null,
  created_at timestamptz not null default now(),
  push_id bigint references public.ingest_pushes (id) on delete set null
);

alter table public.ingest_tokens enable row level security;
alter table public.ingest_pushes enable row level security;
alter table public.daily_energy enable row level security;
alter table public.recommendations enable row level security;

-- Defense in depth on top of RLS: clients get no table privileges at all.
revoke all on public.ingest_tokens, public.ingest_pushes, public.daily_energy, public.recommendations
  from anon, authenticated;

-- Stores one validated v1 payload (validated by the API layer before this call).
-- Returns {"status":"created"} or {"status":"duplicate"}; raises P0401 for an unknown or revoked
-- token and P0409 when the same capture time arrives with different content.
create function public.ingest_push(p_token text, p_payload jsonb)
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

  insert into public.daily_energy (day, pv_kwh, load_kwh, grid_import_kwh, grid_export_kwh, captured_at, push_id)
  select
    (d ->> 'day')::date,
    (d ->> 'pv_kwh')::numeric,
    (d ->> 'load_kwh')::numeric,
    (d ->> 'grid_import_kwh')::numeric,
    (d ->> 'grid_export_kwh')::numeric,
    v_captured_at,
    v_push_id
  from jsonb_array_elements(coalesce(p_payload -> 'daily_history', '[]'::jsonb)) as d
  on conflict (day) do update set
    pv_kwh = excluded.pv_kwh,
    load_kwh = excluded.load_kwh,
    grid_import_kwh = excluded.grid_import_kwh,
    grid_export_kwh = excluded.grid_export_kwh,
    captured_at = excluded.captured_at,
    updated_at = now(),
    push_id = excluded.push_id
  where public.daily_energy.captured_at <= excluded.captured_at;

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

  return jsonb_build_object('status', 'created');
end;
$$;

-- Supabase grants EXECUTE on new public functions to anon and authenticated by default.
revoke all on function public.ingest_push(text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_push(text, jsonb) to anon;
