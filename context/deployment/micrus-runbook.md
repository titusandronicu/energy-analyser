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
```

Restrict it immediately:

```bash
chmod 600 /opt/energy-analyser/.env.runtime
```

In Supabase, disable public email signup, create the single owner account, and set the Site URL to `https://neil170-20170.mikrus.cloud`.

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
curl -I https://neil170-20170.mikrus.cloud/auth/signup
```

Confirm owner login and logout in a browser. Restart the container once and confirm it returns healthy. Do not run `npm run smoke` against production because that test creates a user.

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
