-- Alert rules: the owner manages rules ("the lab snapshot is older than N minutes", "the projected bill is above X PLN")
-- and a scheduled evaluator (POST /api/alerts/evaluate) tells the owner on Telegram when one fires. Design:
-- context/changes/alert-rules/plan.md (Phase 1).
-- alert_rules is the second table a signed-in client writes, hardened like day_notes (20261001072438_day_notes.sql):
-- owner-only policies per operation and column grants. The evaluator runs without a session, so it uses two
-- anon-callable security definer functions guarded by a dedicated alert_tokens table (never ingest_tokens: a leaked
-- cron token must not be able to forge pushes, and an ingest token must not be able to evaluate).

create table public.alert_rules (
  id bigint generated always as identity primary key,
  -- Set by the database. Clients have no insert or update grant on it and cannot read it.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('live_stale', 'bill_above')),
  -- live_stale: whole minutes of snapshot age, 15 to 1440. bill_above: PLN, 1 to 7000. The limits are mirrored in
  -- src/lib/services/alert-rules.ts and tests/integration/alert-rules.test.ts fails when the two drift.
  threshold numeric not null,
  -- 1 to 60 characters and not only spaces when set (null means no label).
  label text check (label is null or (char_length(label) <= 60 and btrim(label) <> '')),
  enabled boolean not null default true,
  -- How often a reminder is sent while an alarm lasts.
  renotify_hours integer not null default 6 check (renotify_hours between 1 and 72),
  -- Owned by the evaluator (alerts_record); no client grant writes them.
  state text not null default 'ok' check (state in ('ok', 'alarm')),
  last_notified_at timestamptz,
  last_evaluated_at timestamptz,
  -- Why the last run could not evaluate this rule; the state is kept as it was.
  unevaluable_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alert_rules_threshold_range check (
    (kind = 'live_stale' and threshold = trunc(threshold) and threshold between 15 and 1440)
    or (kind = 'bill_above' and threshold between 1 and 7000)
  ),
  -- Duplicate rules are refused.
  unique (user_id, kind, threshold)
);

-- Keeps updated_at honest without a client grant on it. Security invoker with an empty search_path; EXECUTE revoked.
create function public.alert_rules_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.alert_rules_set_updated_at() from public, anon, authenticated;

create trigger alert_rules_set_updated_at
  before update on public.alert_rules
  for each row
  execute function public.alert_rules_set_updated_at();

-- A re-enabled or edited rule must never inherit a stale alarm: when `enabled` or `threshold` changes, the state goes
-- back to ok and the "cannot evaluate" reason is cleared. alerts_record changes neither column, so it never trips this.
create function public.alert_rules_reset_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.enabled is distinct from old.enabled or new.threshold is distinct from old.threshold then
    new.state := 'ok';
    new.unevaluable_reason := null;
  end if;
  return new;
end;
$$;

revoke all on function public.alert_rules_reset_state() from public, anon, authenticated;

create trigger alert_rules_reset_state
  before update on public.alert_rules
  for each row
  execute function public.alert_rules_reset_state();

alter table public.alert_rules enable row level security;

-- Defense in depth on top of RLS: clients get nothing until opened below.
revoke all on public.alert_rules from anon, authenticated;

-- Each operation needs the grant AND its policy. Clients read everything but user_id (edit and delete target `id`),
-- insert and change only the rule's own settings, and delete. `kind` is fixed at creation and the evaluator-owned
-- columns (state, last_notified_at, last_evaluated_at, unevaluable_reason) are not client-writable. anon gets nothing.
grant select (
  id, kind, threshold, label, enabled, renotify_hours, state, last_notified_at, last_evaluated_at, unevaluable_reason,
  created_at, updated_at
) on public.alert_rules to authenticated;
grant insert (kind, threshold, label, enabled, renotify_hours) on public.alert_rules to authenticated;
grant update (threshold, label, enabled, renotify_hours) on public.alert_rules to authenticated;
grant delete on public.alert_rules to authenticated;

-- Author and owner: the row must be the signed-in user's own, and that user must be in app_owners.
create policy "owners can read their alert rules"
  on public.alert_rules
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.app_owners o where o.user_id = (select auth.uid()))
  );

create policy "owners can add their alert rules"
  on public.alert_rules
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.app_owners o where o.user_id = (select auth.uid()))
  );

create policy "owners can change their alert rules"
  on public.alert_rules
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.app_owners o where o.user_id = (select auth.uid()))
  )
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.app_owners o where o.user_id = (select auth.uid()))
  );

create policy "owners can delete their alert rules"
  on public.alert_rules
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.app_owners o where o.user_id = (select auth.uid()))
  );

-- Tokens are stored only as SHA-256 hashes, as in ingest_tokens (20260923101001_push_ingestion.sql). Several may be
-- active at once so rotation is: insert new -> switch the workflow secret -> set revoked_at on the old one.
create table public.alert_tokens (
  id bigint generated always as identity primary key,
  label text not null unique,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.alert_tokens enable row level security;
revoke all on public.alert_tokens from anon, authenticated;

-- What the evaluator needs, in one read: the enabled rules, the newest homelab push for the live state and the newest
-- homelab push that carries a bill forecast. The two pushes are selected straight from ingest_pushes with the filters
-- of the live_state and bill_forecast views (20260925123751_live_state_view.sql, 20260929101530_bill_forecast_view.sql),
-- because those views are security_invoker and would read nothing for the anon role. The rows have the shape the
-- loaders produce (captured_at, received_at, state | bill_forecast), so the app's mappers apply unchanged.
-- Returns {"rules": [...], "live": {...} | null, "forecast": {...} | null}; raises P0401 for an unknown or revoked
-- token, the same error for both.
create function public.alerts_snapshot(p_token text)
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
      where r.enabled
    ),
    'live',
    (
      select jsonb_build_object('captured_at', p.captured_at, 'received_at', p.received_at, 'state', p.payload -> 'state')
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

-- Writes back what a run decided: an array of {id, state, notified, reason}. Only the evaluator-owned columns of
-- existing rules change; an unknown id is ignored and any other key is ignored. last_notified_at moves only when
-- `notified` is true. An outcome the evaluator could not decide arrives as the stored state plus a reason. Raises P0401
-- for an unknown or revoked token and 22023 for a body that is not an array or carries a state other than ok or alarm.
create function public.alerts_record(p_token text, p_results jsonb)
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
  where r.id = x.id;
end;
$$;

-- Supabase grants EXECUTE on new functions to anon and authenticated by default; only the anon-key route calls these.
revoke all on function public.alerts_snapshot(text) from public, anon, authenticated;
grant execute on function public.alerts_snapshot(text) to anon;
revoke all on function public.alerts_record(text, jsonb) from public, anon, authenticated;
grant execute on function public.alerts_record(text, jsonb) to anon;
