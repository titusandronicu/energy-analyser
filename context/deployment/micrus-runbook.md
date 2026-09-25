# Micr.us production runbook

This runbook covers the one-time server bootstrap and the first deployment of Energy Analyser. Run the commands from a trusted local terminal. Do not paste passwords or private keys into issues, commits, or chat.

## 1. Connect and verify the VPS

Log in with the initial Micr.us root password:

```bash
ssh -p 10170 root@neil170.mikrus.xyz
```

Before changing the server, verify the assumptions from the approved plan:

```bash
cat /etc/os-release
free -h
df -h /
ss -lnt
```

Stop if the host is not Debian/Ubuntu, has less than 512 MB RAM or 1 GB free disk, or port `20170` is already occupied.

## 2. Install Docker and create the deploy account

Install Docker Engine and the Compose plugin from Docker's official Debian/Ubuntu repository. Then create the restricted deployment account and application directory:

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -o deploy -g deploy -m 750 /opt/energy-analyser
docker version
docker compose version
```

Generate a dedicated key on the operator machine and install only its public half on the VPS:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/energy-analyser-deploy -C energy-analyser-deploy
ssh-copy-id -i ~/.ssh/energy-analyser-deploy.pub -p 10170 deploy@neil170.mikrus.xyz
ssh -i ~/.ssh/energy-analyser-deploy -p 10170 deploy@neil170.mikrus.xyz
```

Keep the root password and a separate administrator key as the recovery path. Do not disable root/password access until key-based recovery has been tested.

## 3. Add runtime configuration

As `deploy`, create `/opt/energy-analyser/.env.runtime` directly on the VPS:

```dotenv
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=PUBLIC_ANON_KEY
ALLOW_SIGNUP=false
APP_ORIGIN=https://neil170-20170.mikrus.cloud
HOST=2a01:4f9:6b:4f6b::170
```

Restrict it immediately:

```bash
chmod 600 /opt/energy-analyser/.env.runtime
```

In Supabase, set global `auth.enable_signup=false`, keep `auth.email.enable_signup=true` so the existing owner can still sign in, create the single owner account, and set the Site URL to `https://neil170-20170.mikrus.cloud`.

Sign-in is an emailed one-time link. Under Authentication → Emails, set **both** the "Magic link" and "Confirm signup" templates to the body of `supabase/templates/magic-link.html` (subject: `Twój link do logowania — Energy Analyser`). Do this **before** deploying a release that includes `/auth/confirm`: Supabase's default template links to a flow the app doesn't accept, so sign-in fails until the template is changed. The owner's sign-in email must be a member of the Supabase organisation while the built-in mailer is used.

Only users listed in `public.app_owners` can read the pushed data. After applying the migrations, register the owner once in the SQL editor:

```sql
insert into public.app_owners (user_id)
select id from auth.users where email = '<owner email>'
on conflict do nothing;
```

Never apply `supabase/seed.sql` to production: its trigger makes every user an owner.

## 4. Configure GitHub

Create the public repository `titusandronicu/energy-analyser`, push `main`, and configure the `production` environment with required reviewers. Add these environment secrets:

- `SSH_HOST`: `neil170.mikrus.xyz`
- `SSH_PORT`: `10170`
- `SSH_USER`: `deploy`
- `SSH_PRIVATE_KEY`: contents of `~/.ssh/energy-analyser-deploy`
- `SSH_KNOWN_HOSTS`: output of `ssh-keyscan -p 10170 neil170.mikrus.xyz`, verified against the fingerprint seen during the trusted first login

After the first image is published, make the GHCR package public. The VPS then pulls immutable `sha-<40-character-commit>` tags without registry credentials.

## 5. Deploy and verify

Wait for CI and image publication for the chosen commit. Run the **Deploy production** workflow with its full lowercase 40-character SHA. After approval, verify:

```bash
curl -fsS https://neil170-20170.mikrus.cloud/api/health
curl -I https://neil170-20170.mikrus.cloud/dashboard
curl -I https://neil170-20170.mikrus.cloud/auth/signup   # expect 404
```

Confirm owner sign-in in a browser: request a link, open it on a different device than the one that requested it, land on `/dashboard`, then sign out. Restart the container once and confirm it returns healthy. Do not run `npm run smoke` against production because that test creates a user.

## Rollback

The workflow retains `release.env.previous` and `compose.yaml.previous`. To roll back manually as `deploy`:

```bash
cd /opt/energy-analyser
cp release.env.previous release.env
test ! -f compose.yaml.previous || cp compose.yaml.previous compose.yaml
docker compose --env-file release.env pull
docker compose --env-file release.env up -d
docker compose --env-file release.env ps
```

## Disk space

The Micr.us disk is small. The deploy workflow keeps only the running and previous app images, removes the rest before pulling, and stops without changing anything when less than 1 GB is free ("Only N MB free on the production host"). If that happens, check what is using the space as `deploy`:

```bash
df -h / /var/lib
docker system df
docker image ls ghcr.io/titusandronicu/energy-analyser
```

Remove app images the running container doesn't use (`docker image rm <id>`; Docker refuses to remove the one in use), then `docker image prune -f` and `docker builder prune -f`. If the space is used outside Docker, look before deleting anything (`sudo du -xh --max-depth=2 / | sort -h | tail -20`), then re-run the deploy.

## Database migrations and rollback

Migrations are applied to production through the Supabase connector; afterwards the repo file is renamed to the version production recorded. Each one so far is additive (tables, grants, policies, views), so a rollback only removes what it added. For `20260925123751_live_state_view.sql`:

```sql
drop view public.live_state;
drop policy "owners can read ingest pushes" on public.ingest_pushes;
revoke select (source, captured_at, received_at, payload) on public.ingest_pushes from authenticated;
```

For `20260925150014_daily_forecast.sql`, re-run the `ingest_push` definition from `20260923101001_push_ingestion.sql` as `create or replace function` (with its revoke/grant lines). The `pv_forecast_kwh` column can stay; the old function never reads it, and the old contract rejects the field before it reaches the database.

Roll the app back first (see Rollback) so no deployed code still reads the view. Owners can read the retained raw push payloads (`payload`, 14 days) from `ingest_pushes` directly, not only through `live_state`; `token_id` and `payload_hash` stay unreadable.
