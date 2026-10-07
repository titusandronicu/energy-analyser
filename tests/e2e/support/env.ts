// Where the e2e run may point: only a local stack, only an anon key, never a secret key (the rules live in
// tests/support/local-guards.ts). Playwright does not load `.env`, so a missing value names the recipe.

import { resolveLocalDbUrl, resolveLocalStack } from "../../support/local-guards";

const RECIPE =
  "scripts/remote-docker.sh exec npx supabase status -o env | grep -E '^(API_URL|ANON_KEY)=' " +
  "(map API_URL to SUPABASE_URL and ANON_KEY to SUPABASE_ANON_KEY; context/foundation/test-plan.md §6.2)";

export interface StackEnv {
  url: string;
  anonKey: string;
}

// Reads the stack settings and refuses unsafe ones. Never skips: a skipped run would pass CI vacuously.
export function requireStackEnv(): StackEnv {
  const { url, anonKey } = resolveLocalStack(
    "the e2e run",
    `The e2e run needs a reachable local Supabase stack: set SUPABASE_URL and SUPABASE_ANON_KEY. Take only those two values with: ${RECIPE}`,
  );
  return { url: url.replace(/\/+$/, ""), anonKey };
}

// The connection string for the teardown's one privileged statement. SUPABASE_DB_URL overrides the local default; an
// empty value means unset. Never echoed: it carries a password.
export function requireDbUrl(): string {
  return resolveLocalDbUrl("the e2e teardown");
}
