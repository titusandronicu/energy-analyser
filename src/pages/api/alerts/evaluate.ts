import type { APIRoute } from "astro";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "astro:env/server";
import { handleAlertsEvaluate } from "@/lib/services/alerts-evaluate";
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

// Scheduled evaluator (GitHub Actions). Bearer-authenticated with the alerts token, which only the two database
// functions know how to check; it lives in TOKEN_AUTH_ROUTES, so there is no Origin check and no session.
export const POST: APIRoute = async ({ request, locals }) => {
  const supabase = createAnonClient();
  if (!supabase) {
    return json(503, { error: "Supabase is not configured" });
  }

  const { status, body } = await handleAlertsEvaluate(request, {
    snapshot: (token) => supabase.rpc("alerts_snapshot", { p_token: token }),
    record: (token, results) => supabase.rpc("alerts_record", { p_token: token, p_results: results }),
    telegram: { botToken: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID },
    fetch,
    now: () => new Date(),
    log: locals.log,
  });
  return json(status, body);
};
