-- Fixes from the alert-rules implementation review (context/changes/alert-rules/reviews/impl-review.md, 2026-10-06).
-- The applied 20261007090000_alert_rules.sql stays as it is; everything here replaces or adds.

-- F5: at most 20 enabled rules per owner, so one run stays a bounded number of Telegram messages. Counted on insert and
-- when a rule is switched on. Security definer with an empty search_path and EXECUTE revoked, because clients have no
-- select grant on user_id, which the count filters by; it counts only the row's own user. P0429 is mapped to a notice
-- by src/lib/services/alert-rules.ts.
create function public.alert_rules_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.enabled and (tg_op = 'INSERT' or not old.enabled) then
    if (
      select count(*)
      from public.alert_rules r
      where r.user_id = new.user_id and r.enabled and r.id is distinct from new.id
    ) >= 20 then
      raise exception 'too many enabled alert rules' using errcode = 'P0429';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.alert_rules_enforce_limit() from public, anon, authenticated;

create trigger alert_rules_enforce_limit
  before insert or update of enabled on public.alert_rules
  for each row
  execute function public.alert_rules_enforce_limit();

-- F4 and F8: alerts_snapshot hands the evaluator only what it needs. The live row carries just its two timestamps (the
-- pushed state, the home's power figures, never left the database for no reason), and only rules of an owner in
-- app_owners are returned, so a row of a user who is no longer an owner is not evaluated or messaged.
create or replace function public.alerts_snapshot(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.alert_tokens t
    where t.token_hash = extensions.digest(coalesce(p_token, ''), 'sha256')
      and t.revoked_at is null
  ) then
    raise exception 'invalid alerts token' using errcode = 'P0401';
  end if;

  return jsonb_build_object(
    'rules',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'kind', r.kind,
            'threshold', r.threshold,
            'label', r.label,
            'renotify_hours', r.renotify_hours,
            'state', r.state,
            'last_notified_at', r.last_notified_at
          )
          order by r.id
        ),
        '[]'::jsonb
      )
      from public.alert_rules r
      join public.app_owners o on o.user_id = r.user_id
      where r.enabled
    ),
    'live',
    (
      select jsonb_build_object('captured_at', p.captured_at, 'received_at', p.received_at)
      from public.ingest_pushes p
      where p.source = 'homelab'
      order by p.captured_at desc
      limit 1
    ),
    'forecast',
    (
      select jsonb_build_object(
        'captured_at', p.captured_at,
        'received_at', p.received_at,
        'bill_forecast', p.payload -> 'bill_forecast'
      )
      from public.ingest_pushes p
      where p.source = 'homelab'
        and p.payload ? 'bill_forecast'
      order by p.captured_at desc
      limit 1
    )
  );
end;
$$;

-- F1: alerts_record only touches enabled rules. A rule switched off while a run was sending cannot be written back
-- with a stale state or a fresh last_notified_at. Same arguments as before: an array of {id, state, notified, reason};
-- an unknown id and any other key are ignored. Raises P0401 for an unknown or revoked token and 22023 for a body that is
-- not an array and for an element without an id or with a state other than ok or alarm. A field of the wrong type in an
-- element raises the cast error of jsonb_to_recordset instead.
create or replace function public.alerts_record(p_token text, p_results jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.alert_tokens t
    where t.token_hash = extensions.digest(coalesce(p_token, ''), 'sha256')
      and t.revoked_at is null
  ) then
    raise exception 'invalid alerts token' using errcode = 'P0401';
  end if;

  if p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception 'alert results must be an array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_results) as x(id bigint, state text, notified boolean, reason text)
    where x.id is null or x.state is null or x.state not in ('ok', 'alarm')
  ) then
    raise exception 'alert result needs an id and a state of ok or alarm' using errcode = '22023';
  end if;

  update public.alert_rules r
  set state = x.state,
      last_evaluated_at = now(),
      unevaluable_reason = left(x.reason, 200),
      last_notified_at = case when coalesce(x.notified, false) then now() else r.last_notified_at end
  from jsonb_to_recordset(p_results) as x(id bigint, state text, notified boolean, reason text)
  where r.id = x.id
    and r.enabled;
end;
$$;

-- create or replace keeps the grants, but state them again so this file stands on its own.
revoke all on function public.alerts_snapshot(text) from public, anon, authenticated;
grant execute on function public.alerts_snapshot(text) to anon;
revoke all on function public.alerts_record(text, jsonb) from public, anon, authenticated;
grant execute on function public.alerts_record(text, jsonb) to anon;
