// Where the e2e run may point. Mirrors the guards of tests/integration/support/stack.ts and privileged.ts: only a local
// stack, only an anon key, never a secret key. Playwright does not load `.env`, so a missing value names the recipe.

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const DEFAULT_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const RECIPE =
  "scripts/remote-docker.sh exec npx supabase status -o env | grep -E '^(API_URL|ANON_KEY)=' " +
  "(map API_URL to SUPABASE_URL and ANON_KEY to SUPABASE_ANON_KEY; context/foundation/test-plan.md §6.2)";

export interface StackEnv {
  url: string;
  anonKey: string;
}

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

// Reads the stack settings and refuses unsafe ones. Never skips: a skipped run would pass CI vacuously.
export function requireStackEnv(): StackEnv {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error(
      `The e2e run needs a reachable local Supabase stack: set SUPABASE_URL and SUPABASE_ANON_KEY. Take only those two values with: ${RECIPE}`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("SUPABASE_URL is not a valid URL; the e2e run only uses 127.0.0.1 or localhost.");
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Refusing to run against SUPABASE_URL host "${parsed.hostname}": the e2e run writes data and only uses a local stack (127.0.0.1 or localhost).`,
    );
  }
  if (parsed.protocol !== "http:") {
    throw new Error("SUPABASE_URL must use http: the local stack has no TLS.");
  }

  // Fails closed: only an anon key passes, whatever shape a secret key might take.
  if (anonKey.startsWith("sb_secret_") || jwtRole(anonKey) === "service_role") {
    throw new Error(
      "SUPABASE_ANON_KEY holds a secret or service_role key; secret keys are forbidden here. Use the anon key.",
    );
  }
  if (!anonKey.startsWith("sb_publishable_") && jwtRole(anonKey) !== "anon") {
    throw new Error("SUPABASE_ANON_KEY must be the anon key (an sb_publishable_ key or a JWT with role anon).");
  }
  return { url: url.replace(/\/+$/, ""), anonKey };
}

// The connection string for the teardown's one privileged statement. SUPABASE_DB_URL overrides the local default; an
// empty value means unset. Never echoed: it carries a password.
export function requireDbUrl(): string {
  const fromEnv = process.env.SUPABASE_DB_URL?.trim();
  const raw = fromEnv === undefined || fromEnv === "" ? DEFAULT_DB_URL : fromEnv;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      "SUPABASE_DB_URL is not a valid connection URL; the e2e teardown only runs against 127.0.0.1 or localhost.",
    );
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Refusing to run privileged SQL against database host "${parsed.hostname}": the e2e teardown only runs against a local stack (127.0.0.1 or localhost).`,
    );
  }
  return raw;
}
