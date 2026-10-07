import { CLOCK_SKEW_MS, formatAge, HOUR_MS, MINUTE_MS } from "@/lib/format/age";
import { plnLabel } from "@/lib/format/values";
import { ALERT_KIND_LABELS, type AlertKind } from "@/lib/services/alert-rules";
import { toBillForecastView } from "@/lib/services/bill-forecast";
import type { BillForecastRow } from "@/types";

// Pure evaluation of the alert rules: from the snapshot alerts_snapshot returns and `now`, what each enabled rule's
// outcome is and which Telegram message (if any) it calls for. No I/O, no clock of its own. docs/logic.md gets the
// rules in Phase 4; the design is context/changes/alert-rules/plan.md (Phase 3).

// A newest `captured_at` ahead of this app's clock by more than this is a producer clock error, so the rule cannot be
// judged. The same 5 minutes the ingest contract allows; live-state.ts has no such rule, so it is stated here.
export const LIVE_FUTURE_SKEW_MS = CLOCK_SKEW_MS;

export type AlertState = "ok" | "alarm";

// A rule as alerts_snapshot returns it (enabled rules only).
export interface SnapshotRule {
  id: number;
  kind: AlertKind;
  threshold: number;
  label: string | null;
  renotify_hours: number;
  state: AlertState;
  last_notified_at: string | null;
}

// The two pushes the loaders would produce; `live` is the newest push (its two timestamps are all a rule reads, the
// state itself never leaves the database), `forecast` the newest one with a forecast.
export interface AlertSnapshot {
  rules: SnapshotRule[];
  live: { captured_at: string; received_at: string } | null;
  forecast: BillForecastRow | null;
}

// `observed` is the figure the message quotes ("12 min", "ok. 258 zł"); `reason` is text for the owner's page.
export type RuleOutcome = { status: "ok" | "alarm"; observed: string } | { status: "unknown"; reason: string };

export type NotificationType = "alarm" | "reminder" | "recovery";

export interface RuleDecision {
  rule: SnapshotRule;
  outcome: RuleOutcome;
  // The message this run owes the owner for the rule, or null.
  notification: { type: NotificationType; text: string } | null;
}

function unknown(reason: string): RuleOutcome {
  return { status: "unknown", reason };
}

// Strictly above the line is an alarm; exactly on it is not.
function evaluateLiveStale(rule: SnapshotRule, snapshot: AlertSnapshot, now: Date): RuleOutcome {
  // No push on record (the table is pruned after 14 days) is the very thing the rule watches for.
  if (!snapshot.live) return { status: "alarm", observed: "brak zapisanych danych" };
  const capturedAt = Date.parse(snapshot.live.captured_at);
  if (Number.isNaN(capturedAt)) return unknown("Nie wiadomo, kiedy powstały ostatnie dane z domu.");
  const ageMs = now.getTime() - capturedAt;
  if (ageMs < -LIVE_FUTURE_SKEW_MS) return unknown("Ostatnie dane z domu mają czas z przyszłości.");
  const observed = formatAge(ageMs);
  return { status: ageMs > rule.threshold * MINUTE_MS ? "alarm" : "ok", observed };
}

function evaluateBillAbove(rule: SnapshotRule, snapshot: AlertSnapshot, now: Date): RuleOutcome {
  const view = toBillForecastView(snapshot.forecast, now);
  if (view.kind === "empty") return unknown(view.status.label);
  if (view.kind === "unavailable") return unknown(view.reason);
  // The forecast describes another month: it says nothing about this month's bill.
  if (view.isOtherMonth) return unknown(view.status.label);
  return { status: view.centralPln > rule.threshold ? "alarm" : "ok", observed: view.centralLabel };
}

export function evaluateRule(rule: SnapshotRule, snapshot: AlertSnapshot, now: Date): RuleOutcome {
  return rule.kind === "live_stale" ? evaluateLiveStale(rule, snapshot, now) : evaluateBillAbove(rule, snapshot, now);
}

function ruleName(rule: SnapshotRule): string {
  return rule.label ?? ALERT_KIND_LABELS[rule.kind];
}

// What the rule watches, with its line and the observed value, in one sentence.
function detail(rule: SnapshotRule, observed: string): string {
  if (rule.kind === "live_stale") {
    return `Ostatnie dane z domu: ${observed} (próg: ${String(rule.threshold)} min).`;
  }
  return `Prognozowany rachunek: ${observed} (próg: ${plnLabel(rule.threshold)}).`;
}

const HEADINGS: Record<NotificationType, string> = {
  alarm: "ALARM",
  reminder: "PRZYPOMNIENIE",
  recovery: "WRÓCIŁO DO NORMY",
};

export function buildMessage(type: NotificationType, rule: SnapshotRule, observed: string): string {
  return `${HEADINGS[type]}: ${ruleName(rule)}\n${detail(rule, observed)}`;
}

// The reminder is due when the last message is at least `renotify_hours` old; a rule that never sent one is due.
function reminderDue(rule: SnapshotRule, now: Date): boolean {
  if (rule.last_notified_at === null) return true;
  const last = Date.parse(rule.last_notified_at);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= rule.renotify_hours * HOUR_MS;
}

// unknown -> nothing; ok->alarm -> alarm; alarm->alarm -> reminder when due; alarm->ok -> recovery; ok->ok -> nothing.
function notificationFor(
  rule: SnapshotRule,
  outcome: RuleOutcome,
  now: Date,
): { type: NotificationType; text: string } | null {
  if (outcome.status === "unknown") return null;
  let type: NotificationType | null = null;
  if (outcome.status === "alarm") {
    if (rule.state === "ok") type = "alarm";
    else if (reminderDue(rule, now)) type = "reminder";
  } else if (rule.state === "alarm") {
    type = "recovery";
  }
  return type === null ? null : { type, text: buildMessage(type, rule, outcome.observed) };
}

export function evaluateAlerts(snapshot: AlertSnapshot, now: Date): RuleDecision[] {
  return snapshot.rules.map((rule) => {
    // One rule's odd data must not stop the others: it is reported as one that cannot be judged.
    try {
      const outcome = evaluateRule(rule, snapshot, now);
      return { rule, outcome, notification: notificationFor(rule, outcome, now) };
    } catch {
      return { rule, outcome: unknown("Nie udało się ocenić tej reguły."), notification: null };
    }
  });
}
