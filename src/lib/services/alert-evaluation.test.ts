import { describe, expect, it } from "vitest";
import type { BillForecastRow } from "@/types";
import {
  buildMessage,
  evaluateAlerts,
  evaluateRule,
  LIVE_FUTURE_SKEW_MS,
  type AlertSnapshot,
  type SnapshotRule,
} from "./alert-evaluation";

// All data here is synthetic. Expected outcomes are written from the plan (context/changes/alert-rules/plan.md,
// Phase 3): strictly above the line is an alarm, no push on record is an alarm, a forecast that cannot be read (or is
// for another month) is "unknown", and the action table decides the message.

const now = new Date("2026-09-23T10:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

function rule(overrides: Partial<SnapshotRule> = {}): SnapshotRule {
  return {
    id: 1,
    kind: "live_stale",
    threshold: 30,
    label: null,
    renotify_hours: 6,
    state: "ok",
    last_notified_at: null,
    ...overrides,
  };
}

function live(ageMs: number): AlertSnapshot["live"] {
  return { captured_at: ago(ageMs), received_at: ago(ageMs), state: {} };
}

// A body the bill view accepts: 15 complete days, central 257.73 inside 155.08-360.4, generated 5 minutes ago.
function forecastRow(overrides: Record<string, unknown> = {}): BillForecastRow {
  const body = {
    status: "ok",
    month: "2026-09",
    confidence: "high",
    completed_days_used: 15,
    observed_days: Array.from({ length: 15 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      grid_import_kwh: 18.3,
    })),
    average_daily_import_kwh: 18.3,
    projected_import_kwh: 549,
    projected_bill_gross_pln: 257.73,
    range_gross_pln: { low: 155.08, high: 360.4 },
    projected_credit_kwh: 355.1,
    projected_billable_kwh: 193.9,
    credit_left_kwh: 0,
    settlement: { reference_period: "2026-08", reference_lag_months: 0, export_ratio: 0.809 },
    pricing: {},
    generated_at: ago(5 * MIN),
    ...overrides,
  };
  return { captured_at: ago(5 * MIN), received_at: ago(5 * MIN), bill_forecast: body };
}

function snapshot(overrides: Partial<AlertSnapshot> = {}): AlertSnapshot {
  return { rules: [], live: live(MIN), forecast: forecastRow(), ...overrides };
}

const billRule = (overrides: Partial<SnapshotRule> = {}) =>
  rule({ id: 2, kind: "bill_above", threshold: 250, ...overrides });

describe("evaluateRule: live_stale", () => {
  it("is ok below the line", () => {
    expect(evaluateRule(rule(), snapshot({ live: live(29 * MIN) }), now)).toEqual({ status: "ok", observed: "29 min" });
  });

  it("is ok exactly on the line", () => {
    expect(evaluateRule(rule(), snapshot({ live: live(30 * MIN) }), now).status).toBe("ok");
  });

  it("is an alarm one millisecond past the line", () => {
    expect(evaluateRule(rule(), snapshot({ live: live(30 * MIN + 1) }), now).status).toBe("alarm");
  });

  it("quotes the age in hours once it is past an hour", () => {
    expect(evaluateRule(rule(), snapshot({ live: live(3 * HOUR) }), now)).toEqual({
      status: "alarm",
      observed: "3 godz.",
    });
  });

  it("is an alarm when no push is on record", () => {
    expect(evaluateRule(rule(), snapshot({ live: null }), now)).toEqual({
      status: "alarm",
      observed: "brak zapisanych danych",
    });
  });

  it("is ok for a captured_at slightly ahead of the clock", () => {
    expect(evaluateRule(rule(), snapshot({ live: live(-LIVE_FUTURE_SKEW_MS) }), now).status).toBe("ok");
  });

  it("is unknown for a captured_at more than 5 minutes ahead", () => {
    const outcome = evaluateRule(rule(), snapshot({ live: live(-LIVE_FUTURE_SKEW_MS - 1) }), now);
    expect(outcome.status).toBe("unknown");
    expect("reason" in outcome && outcome.reason).toContain("z przyszłości");
  });

  it("is unknown for an unreadable captured_at", () => {
    const outcome = evaluateRule(
      rule(),
      snapshot({ live: { captured_at: "never", received_at: "never", state: {} } }),
      now,
    );
    expect(outcome.status).toBe("unknown");
  });

  it("does not look at the forecast", () => {
    expect(evaluateRule(rule(), snapshot({ forecast: null }), now).status).toBe("ok");
  });
});

describe("evaluateRule: bill_above", () => {
  it("is ok below the threshold", () => {
    expect(evaluateRule(billRule({ threshold: 258 }), snapshot(), now)).toEqual({
      status: "ok",
      observed: "ok. 258 zł",
    });
  });

  it("is ok exactly on the threshold", () => {
    expect(evaluateRule(billRule({ threshold: 257.73 }), snapshot(), now).status).toBe("ok");
  });

  it("is an alarm just above the threshold, on the unrounded figure", () => {
    expect(evaluateRule(billRule({ threshold: 257.72 }), snapshot(), now)).toEqual({
      status: "alarm",
      observed: "ok. 258 zł",
    });
  });

  it("is unknown without a forecast on record", () => {
    const outcome = evaluateRule(billRule(), snapshot({ forecast: null }), now);
    expect(outcome).toEqual({ status: "unknown", reason: "laboratorium jeszcze nie przesłało prognozy" });
  });

  it("is unknown with the view's reason for a stale forecast", () => {
    const outcome = evaluateRule(billRule(), snapshot({ forecast: forecastRow({ generated_at: ago(31 * MIN) }) }), now);
    expect(outcome).toEqual({
      status: "unknown",
      reason: "Ostatnie wyliczenie ma już 31 min — kwota z niego byłaby nieaktualna.",
    });
  });

  it("is unknown for a no_data forecast", () => {
    const outcome = evaluateRule(
      billRule(),
      snapshot({ forecast: forecastRow({ status: "no_data", reason: "no_complete_days" }) }),
      now,
    );
    expect(outcome).toEqual({
      status: "unknown",
      reason: "Miesiąc dopiero się zaczął — kwota pojawi się po pierwszym pełnym dniu.",
    });
  });

  it("is unknown for a forecast with too few complete days", () => {
    const outcome = evaluateRule(
      billRule(),
      snapshot({ forecast: forecastRow({ observed_days: [{ date: "2026-09-01", grid_import_kwh: 1 }] }) }),
      now,
    );
    expect(outcome.status).toBe("unknown");
    expect("reason" in outcome && outcome.reason).toContain("Za mało dni");
  });

  it("is unknown for an implausible figure", () => {
    const outcome = evaluateRule(
      billRule({ threshold: 100 }),
      snapshot({ forecast: forecastRow({ range_gross_pln: { low: 155.08, high: 9500 } }) }),
      now,
    );
    expect(outcome.status).toBe("unknown");
  });

  it("is unknown for a body of an unknown status", () => {
    expect(evaluateRule(billRule(), snapshot({ forecast: forecastRow({ status: "partial" }) }), now).status).toBe(
      "unknown",
    );
  });

  it("is unknown, with the view's label, for a forecast of another month", () => {
    const outcome = evaluateRule(
      billRule({ threshold: 100 }),
      snapshot({ forecast: forecastRow({ month: "2026-08" }) }),
      now,
    );
    expect(outcome).toEqual({ status: "unknown", reason: "to prognoza za sierpień 2026, nie za bieżący miesiąc" });
  });

  it("does not look at the live state", () => {
    expect(evaluateRule(billRule(), snapshot({ live: null }), now).status).toBe("alarm");
  });
});

describe("evaluateAlerts: the action table", () => {
  // live(1 min) is ok for a 30-minute rule; live(2 h) is an alarm.
  const okSnapshot = (rules: SnapshotRule[]) => snapshot({ rules, live: live(MIN) });
  const alarmSnapshot = (rules: SnapshotRule[]) => snapshot({ rules, live: live(2 * HOUR) });

  it("ok -> ok sends nothing", () => {
    const [decision] = evaluateAlerts(okSnapshot([rule({ state: "ok" })]), now);
    expect(decision.outcome.status).toBe("ok");
    expect(decision.notification).toBeNull();
  });

  it("ok -> alarm sends the alarm message", () => {
    const [decision] = evaluateAlerts(alarmSnapshot([rule({ state: "ok" })]), now);
    expect(decision.notification).toEqual({
      type: "alarm",
      text: "ALARM: Dane z domu są nieaktualne\nOstatnie dane z domu: 2 godz. (próg: 30 min).",
    });
  });

  it("alarm -> ok sends the recovery message", () => {
    const [decision] = evaluateAlerts(okSnapshot([rule({ state: "alarm", last_notified_at: ago(MIN) })]), now);
    expect(decision.notification).toEqual({
      type: "recovery",
      text: "WRÓCIŁO DO NORMY: Dane z domu są nieaktualne\nOstatnie dane z domu: 1 min (próg: 30 min).",
    });
  });

  it("alarm -> alarm inside the interval sends nothing", () => {
    const stored = rule({ state: "alarm", renotify_hours: 6, last_notified_at: ago(6 * HOUR - 1) });
    expect(evaluateAlerts(alarmSnapshot([stored]), now)[0].notification).toBeNull();
  });

  it("alarm -> alarm exactly at the interval sends a reminder", () => {
    const stored = rule({ state: "alarm", renotify_hours: 6, last_notified_at: ago(6 * HOUR) });
    expect(evaluateAlerts(alarmSnapshot([stored]), now)[0].notification?.type).toBe("reminder");
  });

  it("alarm -> alarm sends a reminder when nothing was ever sent", () => {
    const stored = rule({ state: "alarm", last_notified_at: null });
    expect(evaluateAlerts(alarmSnapshot([stored]), now)[0].notification?.type).toBe("reminder");
  });

  it("alarm -> alarm sends a reminder when the last time is unreadable", () => {
    const stored = rule({ state: "alarm", last_notified_at: "never" });
    expect(evaluateAlerts(alarmSnapshot([stored]), now)[0].notification?.type).toBe("reminder");
  });

  it("the reminder interval is the rule's own", () => {
    const stored = rule({ state: "alarm", renotify_hours: 1, last_notified_at: ago(HOUR) });
    expect(evaluateAlerts(alarmSnapshot([stored]), now)[0].notification?.type).toBe("reminder");
  });

  it.each<["ok" | "alarm"]>([["ok"], ["alarm"]])("unknown with a stored %s state sends nothing", (state) => {
    const stored = billRule({ state, last_notified_at: ago(48 * HOUR) });
    const [decision] = evaluateAlerts(snapshot({ rules: [stored], forecast: null }), now);
    expect(decision.outcome.status).toBe("unknown");
    expect(decision.notification).toBeNull();
  });

  it("decides every rule on its own", () => {
    const decisions = evaluateAlerts(
      snapshot({ rules: [rule({ id: 1 }), billRule({ id: 2, threshold: 100 })], live: live(MIN) }),
      now,
    );
    expect(decisions.map((d) => [d.rule.id, d.outcome.status, d.notification?.type ?? null])).toEqual([
      [1, "ok", null],
      [2, "alarm", "alarm"],
    ]);
  });

  it("returns nothing for no rules", () => {
    expect(evaluateAlerts(snapshot(), now)).toEqual([]);
  });
});

describe("buildMessage", () => {
  it("names a bill rule by its label and quotes the figure and the threshold", () => {
    expect(buildMessage("alarm", billRule({ label: "Rachunek wrzesień" }), "ok. 258 zł")).toBe(
      "ALARM: Rachunek wrzesień\nPrognozowany rachunek: ok. 258 zł (próg: 250 zł).",
    );
  });

  it("uses the reminder heading", () => {
    expect(buildMessage("reminder", billRule(), "ok. 258 zł")).toMatch(/^PRZYPOMNIENIE: /);
  });
});
