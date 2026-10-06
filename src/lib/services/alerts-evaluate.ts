import { z } from "zod";
import type { Logger } from "@/lib/logger";
import { evaluateAlerts, type AlertSnapshot, type AlertState } from "@/lib/services/alert-evaluation";
import { ALERT_KINDS } from "@/lib/services/alert-rules";
import { sendTelegramMessage } from "@/lib/services/telegram";

// POST /api/alerts/evaluate: bearer-authenticated like /api/ingest (the alerts token is checked inside the two database
// functions). Reads the snapshot, evaluates, sends to Telegram, then records what actually went out. The token, the chat
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

function bearerToken(request: Request) {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get("Authorization") ?? "");
  return match?.[1] ?? null;
}

// The shape alerts_snapshot returns (supabase/migrations/20261007090000_alert_rules.sql). The pushed jsonb inside
// `state` and `bill_forecast` stays untrusted: the view mappers read it defensively.
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
  live: z.object({ captured_at: z.string(), received_at: z.string(), state: z.unknown() }).nullable(),
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
  const records: AlertRecord[] = [];
  let sent = 0;
  let unknown = 0;
  let failed = 0;

  for (const { rule, outcome, notification } of decisions) {
    if (outcome.status === "unknown") {
      // Cannot be decided: the stored state stays and only the reason is recorded.
      unknown += 1;
      records.push({ id: rule.id, state: rule.state, notified: false, reason: outcome.reason });
      continue;
    }
    if (!notification) {
      records.push({ id: rule.id, state: outcome.status, notified: false, reason: null });
      continue;
    }
    const result = await sendTelegramMessage(
      { fetch: deps.fetch },
      { token: botToken, chatId, text: notification.text },
    );
    if (result.ok) {
      sent += 1;
      records.push({ id: rule.id, state: outcome.status, notified: true, reason: null });
    } else {
      // Nothing is recorded for this rule, so the next run decides and sends again.
      failed += 1;
      deps.log?.warn("alert_send_failed", { ruleId: rule.id, type: notification.type, code: result.code });
    }
  }

  if (records.length > 0) {
    const written = await deps.record(token, records);
    if (written.error) {
      if (written.error.code === "P0401") return UNAUTHORIZED;
      // Messages that went out are not on record, so the next run sends them again.
      deps.log?.error("alerts_record_failed", { err: written.error, sent });
      return FAILED;
    }
  }

  return { status: 200, body: { evaluated: decisions.length, sent, unknown, failed } };
}
