import { Client } from "pg";
import { anonClient } from "./stack";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const DEFAULT_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const OVERRIDING_PARAMS = new Set(["host", "hostaddr", "port"]);

// Resolves the connection string for privileged SQL on the local stack and refuses anything that is not local.
// SUPABASE_DB_URL overrides the local default. Never skips and never echoes the string (it carries a password).
// This is the one place the suite runs as postgres: it exists to make a non-owner and an extra ingest token, which the
// anon-key-only stack.ts cannot do (context/archive/2026-10-02-testing-access-and-input-abuse/plan.md, Phase 2). Local only.
export function requirePrivileged(): string {
  const fromEnv = process.env.SUPABASE_DB_URL?.trim();
  // An empty value means "unset", so it falls back to the default like a missing one.
  const raw = fromEnv === undefined || fromEnv === "" ? DEFAULT_DB_URL : fromEnv;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      "SUPABASE_DB_URL is not a valid connection URL; the integration suite only runs against 127.0.0.1 or localhost.",
    );
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Refusing to run privileged SQL against database host "${parsed.hostname}": the integration suite writes data and only runs against a local stack (127.0.0.1 or localhost).`,
    );
  }
  // The pg driver lets these query parameters override the host or port in the URL (`?host=db.example.com` connects
  // to that host while `hostname` above still reads 127.0.0.1), which would walk around the check. Refuse them.
  for (const key of parsed.searchParams.keys()) {
    if (OVERRIDING_PARAMS.has(key.toLowerCase())) {
      throw new Error(
        `Refusing SUPABASE_DB_URL with a "${key}" query parameter: it can redirect the connection away from the host checked here.`,
      );
    }
  }
  return raw;
}

// Connects as postgres, runs `fn`, and always disconnects.
export async function withPrivileged<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: requirePrivileged() });
  db.on("error", () => undefined);
  try {
    await db.connect();
  } catch (cause) {
    throw new Error(
      "Cannot reach the local Postgres of the Supabase stack (default 127.0.0.1:54322, or SUPABASE_DB_URL). " +
        "Start the relay on 54322 with `scripts/remote-docker.sh relay-start` (it relays 54321 and 54322).",
      { cause },
    );
  }
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

// A fresh signed-up user who is NOT an owner: it signs up like ownerClient (the seed trigger in supabase/seed.sql makes
// every new user an owner), then the owner row is removed through the privileged connection. The trigger stays enabled,
// so nothing global changes. Returns the session client and the user id so a test can clean up with `removeUser`.
export async function nonOwnerClient() {
  const client = anonClient();
  const email = `integration-nonowner-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = `Integration-${Math.random().toString(36).slice(2, 12)}-Pw1!`;
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(`non-owner sign-up failed: ${error.message}`);
  if (!data.session || !data.user) {
    throw new Error("non-owner sign-up returned no session; local Supabase must have email confirmation turned off.");
  }
  const userId = data.user.id;
  await withPrivileged((db) => db.query("delete from public.app_owners where user_id = $1", [userId]));
  return { client, userId };
}

// Deletes a user made by nonOwnerClient; their day notes go with them (on delete cascade).
export async function removeUser(userId: string): Promise<void> {
  await withPrivileged((db) => db.query("delete from auth.users where id = $1", [userId]));
}

// Inserts an active ingest token with a label and a secret unique to this call. Returns both: the label is the handle
// for revokeToken and deleteToken, the token is what a push presents.
export async function insertToken(label: string): Promise<{ label: string; token: string }> {
  const unique = `${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`;
  const uniqueLabel = `${label}-${unique}`;
  const token = `access-abuse-token-${unique}`;
  await withPrivileged((db) =>
    db.query(
      "insert into public.ingest_tokens (label, token_hash) values ($1, extensions.digest($2::text, 'sha256'))",
      [uniqueLabel, token],
    ),
  );
  return { label: uniqueLabel, token };
}

export async function revokeToken(label: string): Promise<void> {
  await withPrivileged((db) =>
    db.query("update public.ingest_tokens set revoked_at = now() where label = $1", [label]),
  );
}

// Inserts an active alerts token with a label and a secret unique to this call, the way insertToken does for ingest.
export async function insertAlertToken(label: string): Promise<{ label: string; token: string }> {
  const unique = `${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`;
  const uniqueLabel = `${label}-${unique}`;
  const token = `alert-rules-token-${unique}`;
  await withPrivileged((db) =>
    db.query("insert into public.alert_tokens (label, token_hash) values ($1, extensions.digest($2::text, 'sha256'))", [
      uniqueLabel,
      token,
    ]),
  );
  return { label: uniqueLabel, token };
}

export async function revokeAlertToken(label: string): Promise<void> {
  await withPrivileged((db) => db.query("update public.alert_tokens set revoked_at = now() where label = $1", [label]));
}

export async function deleteAlertToken(label: string): Promise<void> {
  await withPrivileged((db) => db.query("delete from public.alert_tokens where label = $1", [label]));
}

// Removes the token and the raw pushes that were stored under it (ingest_pushes.token_id has no cascade).
export async function deleteToken(label: string): Promise<void> {
  await withPrivileged(async (db) => {
    await db.query(
      "delete from public.ingest_pushes where token_id in (select id from public.ingest_tokens where label = $1)",
      [label],
    );
    await db.query("delete from public.ingest_tokens where label = $1", [label]);
  });
}
