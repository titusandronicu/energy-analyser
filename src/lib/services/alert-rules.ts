import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { queryError } from "@/lib/query-error";
import type { AlertRuleRow } from "@/types";

// Alert rules: the owner's rules for the Telegram alerts, managed on /dashboard/alerts and posted to /api/alert-rules.
// The limits below are enforced by the database checks too (supabase/migrations/20261007090000_alert_rules.sql);
// tests/integration/alert-rules.test.ts fails when the two drift. The service turns the posted form into one write and
// the redirect back to the page, so the route only wires in the Supabase calls (as day-notes.ts does for notes).

export const ALERTS_PATH = "/dashboard/alerts";

export const ALERT_KINDS = ["live_stale", "bill_above"] as const;

// live_stale: whole minutes of snapshot age. 15 is the app's own stale line (LIVE_STALE_AFTER_MS).
export const ALERT_STALE_MIN_MINUTES = 15;
export const ALERT_STALE_MAX_MINUTES = 1440;

// bill_above: the projected gross bill in PLN.
export const ALERT_BILL_MIN_PLN = 1;
export const ALERT_BILL_MAX_PLN = 7000;

export const ALERT_LABEL_MAX_LENGTH = 60;

// Hours between reminders while an alarm lasts.
export const ALERT_RENOTIFY_MIN_HOURS = 1;
export const ALERT_RENOTIFY_MAX_HOURS = 72;
export const ALERT_RENOTIFY_DEFAULT_HOURS = 6;

export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  live_stale: "Dane z domu są nieaktualne",
  bill_above: "Prognozowany rachunek jest wysoki",
};

export type AlertOutcome = "created" | "updated" | "toggled" | "deleted" | "duplicate" | "invalid" | "failed";

// What the alerts page shows after a post, read back from `?alert=`.
export const ALERT_NOTICES: Record<AlertOutcome, string> = {
  created: "Reguła dodana.",
  updated: "Reguła zapisana.",
  toggled: "Stan reguły zmieniony.",
  deleted: "Reguła usunięta.",
  duplicate: "Taka reguła już istnieje: ten sam rodzaj i próg.",
  invalid: "Reguła ma niepoprawne dane. Sprawdź próg, nazwę i odstęp między przypomnieniami.",
  failed: "Nie udało się zapisać reguły. Spróbuj ponownie.",
};

export type AlertForm =
  | { intent: "create"; kind: AlertKind; threshold: number; label: string | null; renotify_hours: number }
  | { intent: "update"; id: number; kind: AlertKind; threshold: number; label: string | null; renotify_hours: number }
  | { intent: "toggle"; id: number; enabled: boolean }
  | { intent: "delete"; id: number };

interface DbError {
  message: string;
  // The Postgres error code when there is one; 23505 is a unique violation.
  code?: string;
}

export interface AlertPostDeps {
  // Wrappers over the Supabase writes, scoped by RLS to the signed-in owner's own rows. The client may set only these
  // columns (kind is fixed at creation), so `update` never carries a kind.
  create: (rule: {
    kind: AlertKind;
    threshold: number;
    label: string | null;
    renotify_hours: number;
  }) => PromiseLike<{ error: DbError | null }>;
  update: (
    id: number,
    changes: { threshold: number; label: string | null; renotify_hours: number },
  ) => PromiseLike<{ error: DbError | null }>;
  setEnabled: (id: number, enabled: boolean) => PromiseLike<{ error: DbError | null }>;
  remove: (id: number) => PromiseLike<{ error: DbError | null }>;
  logError?: (message: string, detail: unknown) => void;
}

const UNIQUE_VIOLATION = "23505";

function field(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

// Whether `threshold` is inside the kind's limits: whole minutes for live_stale, PLN for bill_above.
function thresholdInRange(kind: AlertKind, threshold: number): boolean {
  return kind === "live_stale"
    ? Number.isInteger(threshold) && threshold >= ALERT_STALE_MIN_MINUTES && threshold <= ALERT_STALE_MAX_MINUTES
    : threshold >= ALERT_BILL_MIN_PLN && threshold <= ALERT_BILL_MAX_PLN;
}

const kindSchema = z.enum(ALERT_KINDS);
const idSchema = z.coerce.number().int().positive();
const thresholdSchema = z.coerce.number();
// Optional: a blank label means no label (null).
const labelSchema = z
  .string()
  .trim()
  .max(ALERT_LABEL_MAX_LENGTH)
  .transform((value) => (value === "" ? null : value));
const renotifySchema = z.coerce.number().int().min(ALERT_RENOTIFY_MIN_HOURS).max(ALERT_RENOTIFY_MAX_HOURS);
const inRange = (rule: { kind: AlertKind; threshold: number }) => thresholdInRange(rule.kind, rule.threshold);

const alertFormSchema = z.discriminatedUnion("intent", [
  z
    .object({
      intent: z.literal("create"),
      kind: kindSchema,
      threshold: thresholdSchema,
      label: labelSchema,
      renotify_hours: renotifySchema,
    })
    .refine(inRange),
  // `kind` is posted only so the threshold can be checked against its range; the database never changes it.
  z
    .object({
      intent: z.literal("update"),
      id: idSchema,
      kind: kindSchema,
      threshold: thresholdSchema,
      label: labelSchema,
      renotify_hours: renotifySchema,
    })
    .refine(inRange),
  z.object({
    intent: z.literal("toggle"),
    id: idSchema,
    enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
  }),
  z.object({ intent: z.literal("delete"), id: idSchema }),
]);

// The posted form, or "invalid". The threshold may use a decimal comma; a blank label is no label; a blank reminder
// interval is the default. Anything outside the shared limits is refused here before the database sees it.
export function parseAlertForm(form: FormData): AlertForm | "invalid" {
  const blank = (value: string | undefined) => value === undefined || value.trim() === "";
  const renotify = field(form, "renotify_hours");
  const parsed = alertFormSchema.safeParse({
    intent: field(form, "intent"),
    id: field(form, "id"),
    kind: field(form, "kind"),
    threshold: field(form, "threshold")?.trim().replace(",", "."),
    label: field(form, "label") ?? "",
    renotify_hours: blank(renotify) ? String(ALERT_RENOTIFY_DEFAULT_HOURS) : renotify,
    enabled: field(form, "enabled"),
  });
  return parsed.success ? parsed.data : "invalid";
}

// Back to the alerts page with ?alert=<outcome>. Also for the route's own early exits (an unreadable body, Supabase not
// configured).
export function alertRedirect(outcome: AlertOutcome): { redirect: string } {
  return { redirect: `${ALERTS_PATH}?alert=${outcome}` };
}

// Back to the alerts page with ?alert=created|updated|toggled|deleted|duplicate|invalid|failed. A unique violation
// (same kind and threshold) is `duplicate`. Changing or deleting an id that no longer exists changes no row and is not
// an error, so a second submit of the same form is harmless.
export async function handleAlertPost(form: FormData, deps: AlertPostDeps): Promise<{ redirect: string }> {
  const parsed = parseAlertForm(form);
  if (parsed === "invalid") return alertRedirect("invalid");

  try {
    let result: { error: DbError | null };
    switch (parsed.intent) {
      case "create":
        result = await deps.create({
          kind: parsed.kind,
          threshold: parsed.threshold,
          label: parsed.label,
          renotify_hours: parsed.renotify_hours,
        });
        break;
      case "update":
        result = await deps.update(parsed.id, {
          threshold: parsed.threshold,
          label: parsed.label,
          renotify_hours: parsed.renotify_hours,
        });
        break;
      case "toggle":
        result = await deps.setEnabled(parsed.id, parsed.enabled);
        break;
      case "delete":
        result = await deps.remove(parsed.id);
        break;
    }
    if (result.error) {
      if (result.error.code === UNIQUE_VIOLATION) return alertRedirect("duplicate");
      deps.logError?.(`alert rule ${parsed.intent} failed`, result.error);
      return alertRedirect("failed");
    }
  } catch (cause) {
    deps.logError?.(`alert rule ${parsed.intent} failed`, cause);
    return alertRedirect("failed");
  }
  const outcomes = { create: "created", update: "updated", toggle: "toggled", delete: "deleted" } as const;
  return alertRedirect(outcomes[parsed.intent]);
}

// The notice for an `?alert=` value, or null for none or an unknown value.
export function alertNotice(param: string | null): { tone: "good" | "problem"; text: string } | null {
  if (param === null || !Object.hasOwn(ALERT_NOTICES, param)) return null;
  const outcome = param as AlertOutcome;
  const good = outcome === "created" || outcome === "updated" || outcome === "toggled" || outcome === "deleted";
  return { tone: good ? "good" : "problem", text: ALERT_NOTICES[outcome] };
}

const plnFormat = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });

// "starsze niż 30 min" / "powyżej 500 zł": what the rule's threshold means for its kind.
export function formatAlertThreshold(kind: AlertKind, threshold: number): string {
  return kind === "live_stale"
    ? `starsze niż ${plnFormat.format(threshold)} min`
    : `powyżej ${plnFormat.format(threshold)} zł`;
}

// The signed-in owner's rules, oldest first. RLS returns only their own rows. Errors are thrown so the page can show a
// load failure instead of an empty list.
export async function loadAlertRules(client: SupabaseClient): Promise<AlertRuleRow[]> {
  const { data, error } = await client
    .from("alert_rules")
    .select(
      "id, kind, threshold, label, enabled, renotify_hours, state, last_notified_at, last_evaluated_at, unevaluable_reason, created_at, updated_at",
    )
    .order("id", { ascending: true })
    .overrideTypes<AlertRuleRow[], { merge: false }>();
  if (error) throw queryError("loading the alert rules failed", error);
  return data;
}
