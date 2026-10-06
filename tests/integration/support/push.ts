import { validateIngestPayload } from "@/lib/ingest/contract";
import { handleIngest, type IngestResponse } from "@/lib/services/ingest";
import { anonClient } from "./stack";

// The public local/CI token from supabase/seed.sql.
const SEED_TOKEN = "local-dev-ingest-token-not-secret";

let anon: ReturnType<typeof anonClient> | undefined;

// Pushes a body the way src/pages/api/ingest.ts:25-28 does: the real handleIngest with the real ingest_token_ok
// and ingest_push functions behind an anon client. The body is checked against the contract first, so a builder that drifts
// from it fails here instead of as a 422 that looks like a store problem.
export async function push(body: unknown): Promise<IngestResponse> {
  const checked = validateIngestPayload(body, new Date());
  if (!checked.success) {
    const [issue] = checked.error.issues;
    throw new Error(`test body is not a valid push: ${issue.path.join(".")}: ${issue.message}`);
  }
  anon ??= anonClient();
  const client = anon;
  return handleIngest(
    new Request("http://localhost/api/ingest", {
      method: "POST",
      headers: { Authorization: `Bearer ${SEED_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    {
      tokenOk: (token) => client.rpc("ingest_token_ok", { p_token: token }),
      rpc: (token, payload) => client.rpc("ingest_push", { p_token: token, p_payload: payload }),
      now: () => new Date(),
    },
  );
}
