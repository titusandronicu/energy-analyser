// The one copy of the guards that keep a test run on the local Supabase stack: only a local host, only an anon key,
// never a secret key, and no database URL that can be redirected elsewhere. The e2e run (tests/e2e/support/env.ts) and
// the integration suite (tests/integration/support/stack.ts, privileged.ts) call it with their own wording.
// tests/integration/db-url-guard.test.ts runs one table against every caller, so a change here is checked for all.
// Pure on purpose: no supabase-js, no pg, so Playwright and vitest can both import it. src/lib/supabase.ts has its own,
// weaker anon-key check because it imports `astro:env/server`; it is not shared (docs/decisions.md).

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const DEFAULT_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const OVERRIDING_PARAMS = new Set(["host", "hostaddr", "port"]);

// The role claim of a JWT-shaped key, or null when the key is not a decodable JWT.
function jwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof claims === "object" && claims !== null && "role" in claims && typeof claims.role === "string") {
      return claims.role;
    }
    return null;
  } catch {
    return null;
  }
}

export interface LocalStack {
  url: string;
  anonKey: string;
}

// Reads SUPABASE_URL and SUPABASE_ANON_KEY and refuses unsafe ones. Never skips: a skipped run would pass CI vacuously.
// `subject` names the caller in the refusals ("the integration suite"); `missing` is its message for an unset value.
// The URL is returned as trimmed; a caller that wants it without trailing slashes does that itself.
export function resolveLocalStack(subject: string, missing: string): LocalStack {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error(missing);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`SUPABASE_URL is not a valid URL; ${subject} only runs against 127.0.0.1 or localhost.`);
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Refusing to run against SUPABASE_URL host "${parsed.hostname}": ${subject} writes data and only runs against a local stack (127.0.0.1 or localhost).`,
    );
  }
  if (parsed.protocol !== "http:") {
    throw new Error("SUPABASE_URL must use http: the local stack has no TLS.");
  }

  // Fails closed: only an anon key passes, whatever shape a secret key might take.
  if (anonKey.startsWith("sb_secret_") || jwtRole(anonKey) === "service_role") {
    throw new Error(
      "SUPABASE_ANON_KEY holds a secret or service_role key; secret keys are forbidden here. Use the anon (publishable) key.",
    );
  }
  if (!anonKey.startsWith("sb_publishable_") && jwtRole(anonKey) !== "anon") {
    throw new Error("SUPABASE_ANON_KEY must be the anon key (an sb_publishable_ key or a JWT with role anon).");
  }
  return { url, anonKey };
}

// The connection string for privileged SQL on the local stack. SUPABASE_DB_URL overrides the local default; an empty
// value means unset. Never echoed: it carries a password.
export function resolveLocalDbUrl(subject: string): string {
  const fromEnv = process.env.SUPABASE_DB_URL?.trim();
  const raw = fromEnv === undefined || fromEnv === "" ? DEFAULT_DB_URL : fromEnv;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `SUPABASE_DB_URL is not a valid connection URL; ${subject} only runs against 127.0.0.1 or localhost.`,
    );
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Refusing to run privileged SQL against database host "${parsed.hostname}": ${subject} writes data and only runs against a local stack (127.0.0.1 or localhost).`,
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
