import { z } from "zod";
import type { Logger } from "@/lib/logger";
import { evaluateAlerts, type AlertSnapshot, type AlertState } from "@/lib/services/alert-evaluation";
import { ALERT_KINDS } from "@/lib/services/alert-rules";
import { sendTelegramMessage } from "@/lib/services/telegram";
import { bearerToken } from "@/lib/services/bearer-token";

// POST /api/alerts/evaluate: bearer-authenticated like /api/ingest (the alerts token is checked inside the two database
// functions). Reads the snapshot, evaluates, sends to Telegram and records what actually went out, each sent rule right after its own message (at-least-once delivery). The token, the chat
// id and the message text are never logged or returned.

export interface AlertsRpcResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

export interface AlertRecord {
  id: number;
  state: AlertState;
  notified: boolean;
  reason: string | null;
}

export interface AlertsEvaluateDeps {
  snapshot: (token: string) => PromiseLike<AlertsRpcResult>;
  record: (token: string, results: AlertRecord[]) => PromiseLike<AlertsRpcResult>;
  // The Telegram secrets; either one missing means the route cannot do its job.
  telegram: { botToken: string | undefined; chatId: string | undefined };
  fetch: typeof fetch;
  now: () => Date;
  log?: Pick<Logger, "error" | "warn">;
}

export interface AlertsEvaluateResponse {
  status: number;
  body: Record<string, unknown>;
}

// One body for a missing, unknown and revoked token.
const UNAUTHORIZED: AlertsEvaluateResponse = { status: 401, body: { error: "unauthorized" } };
const FAILED: AlertsEvaluateResponse = { status: 500, body: { error: "alerts evaluation failed" } };

// The shape alerts_snapshot returns (supabase/migrations/20261007090000_alert_rules.sql). The pushed jsonb inside
// `bill_forecast` stays untrusted: the view mapper reads it defensively.
const snapshotSchema = z.object({
  rules: z.array(
    z.object({
      id: z.number(),
      kind: z.enum(ALERT_KINDS),
      threshold: z.number(),
      label: z.string().nullable(),
      renotify_hours: z.number(),
      state: z.enum(["ok", "alarm"]),
      last_notified_at: z.string().nullable(),
    }),
  ),
  live: z.object({ captured_at: z.string(), received_at: z.string() }).nullable(),
  forecast: z.object({ captured_at: z.string(), received_at: z.string(), bill_forecast: z.unknown() }).nullable(),
});

export async function handleAlertsEvaluate(
  request: Request,
  deps: AlertsEvaluateDeps,
): Promise<AlertsEvaluateResponse> {
  const token = bearerToken(request);
  if (!token) return UNAUTHORIZED;

  // A read, so a wrong token and a missing Telegram configuration are told apart only after the token is proven.
  const read = await deps.snapshot(token);
  if (read.error) {
    if (read.error.code === "P0401") return UNAUTHORIZED;
    deps.log?.error("alerts_snapshot_failed", { err: read.error });
    return FAILED;
  }

  const { botToken, chatId } = deps.telegram;
  if (!botToken || !chatId) return { status: 503, body: { error: "telegram_not_configured" } };

  const parsed = snapshotSchema.safeParse(read.data);
  if (!parsed.success) {
    deps.log?.error("alerts_snapshot_unexpected", { err: { message: parsed.error.issues[0].message } });
    return FAILED;
  }
  const snapshot: AlertSnapshot = parsed.data;

  const decisions = evaluateAlerts(snapshot, deps.now());
  // Rules with nothing to send are recorded together at the end. A rule that sent a message is recorded at once, so a
  // later failure cannot make the next run send the same message again.
  const quiet: AlertRecord[] = [];
  let sent = 0;
  let unknown = 0;
  let failed = 0;
  // Telegram answered 429: it is asking for fewer messages, so nothing more is sent this run.
  let throttled = false;

  for (const { rule, outcome, notification } of decisions) {
    if (outcome.status === "unknown") {
      // Cannot be decided: the stored state stays and only the reason is recorded.
      unknown += 1;
      quiet.push({ id: rule.id, state: rule.state, notified: false, reason: outcome.reason });
      continue;
    }
    if (!notification) {
      quiet.push({ id: rule.id, state: outcome.status, notified: false, reason: null });
      continue;
    }
    if (throttled) {
      failed += 1;
      continue;
    }
    const result = await sendTelegramMessage(
      { fetch: deps.fetch },
      { token: botToken, chatId, text: notification.text },
    );
    if (!result.ok) {
      // Nothing is recorded for this rule, so the next run decides and sends again.
      failed += 1;
      if (result.code === "429") throttled = true;
      deps.log?.warn("alert_send_failed", { ruleId: rule.id, type: notification.type, code: result.code });
      continue;
    }
    sent += 1;
    const written = await deps.record(token, [{ id: rule.id, state: outcome.status, notified: true, reason: null }]);
    if (written.error) {
      if (written.error.code === "P0401") return UNAUTHORIZED;
      // This message is not on record, so the next run sends it again: delivery is at-least-once.
      deps.log?.error("alerts_record_failed", { err: written.error, sent });
      return FAILED;
    }
  }

  if (quiet.length > 0) {
    const written = await deps.record(token, quiet);
    if (written.error) {
      if (written.error.code === "P0401") return UNAUTHORIZED;
      deps.log?.error("alerts_record_failed", { err: written.error, sent });
      return FAILED;
    }
  }

  return { status: 200, body: { evaluated: decisions.length, sent, unknown, failed } };
}
