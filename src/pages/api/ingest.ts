import type { APIRoute } from "astro";
import { handleIngest } from "@/lib/services/ingest";
import { createAnonClient } from "@/lib/supabase";

export const prerender = false;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

// Home-lab push endpoint. Bearer-authenticated; see docs/ingest/README.md for the contract.
export const POST: APIRoute = async ({ request }) => {
  const supabase = createAnonClient();
  if (!supabase) {
    return json(503, { error: "Supabase is not configured" });
  }

  const { status, body } = await handleIngest(request, {
    rpc: (token, payload) => supabase.rpc("ingest_push", { p_token: token, p_payload: payload }),
    now: () => new Date(),
    logError: (message, detail) => {
      // eslint-disable-next-line no-console -- server-side detail for failed pushes; never echoed to the caller
      console.error(message, detail);
    },
  });
  return json(status, body);
};
