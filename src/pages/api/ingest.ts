import type { APIRoute } from "astro";
import { handleIngest } from "@/lib/services/ingest";
import { jsonNoStore } from "@/lib/http";
import { createAnonClient } from "@/lib/supabase";

export const prerender = false;

// Home-lab push endpoint. Bearer-authenticated; see docs/ingest/README.md for the contract.
export const POST: APIRoute = async ({ request, locals }) => {
  const supabase = createAnonClient();
  if (!supabase) {
    return jsonNoStore(503, { error: "Supabase is not configured" });
  }

  const { status, body } = await handleIngest(request, {
    tokenOk: (token) => supabase.rpc("ingest_token_ok", { p_token: token }),
    rpc: (token, payload) => supabase.rpc("ingest_push", { p_token: token, p_payload: payload }),
    now: () => new Date(),
    logError: (message, detail) => {
      // Server-side detail for failed pushes; never echoed to the caller.
      locals.log.error(message, { err: detail });
    },
  });
  return jsonNoStore(status, body);
};
