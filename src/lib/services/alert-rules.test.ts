import { describe, expect, it, vi } from "vitest";
import {
  ALERT_BILL_MAX_PLN,
  ALERT_BILL_MIN_PLN,
  ALERT_KIND_LABELS,
  ALERT_LABEL_MAX_LENGTH,
  ALERT_NOTICES,
  ALERT_RENOTIFY_DEFAULT_HOURS,
  ALERT_RENOTIFY_MAX_HOURS,
  ALERT_RENOTIFY_MIN_HOURS,
  ALERT_STALE_MAX_MINUTES,
  ALERT_STALE_MIN_MINUTES,
  alertNotice,
  alertRedirect,
  formatAlertThreshold,
  handleAlertPost,
  parseAlertForm,
  type AlertPostDeps,
} from "./alert-rules";

// All data here is synthetic.

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function deps(error: { message: string; code?: string } | null = null) {
  return {
    create: vi.fn<AlertPostDeps["create"]>(() => Promise.resolve({ error })),
    update: vi.fn<AlertPostDeps["update"]>(() => Promise.resolve({ error })),
    setEnabled: vi.fn<AlertPostDeps["setEnabled"]>(() => Promise.resolve({ error })),
    remove: vi.fn<AlertPostDeps["remove"]>(() => Promise.resolve({ error })),
    logError: vi.fn(),
  };
}

const redirectTo = (outcome: string) => ({ redirect: `/dashboard/alerts?alert=${outcome}` });
const stale = (threshold: string, extra: Record<string, string> = {}) =>
  form({ intent: "create", kind: "live_stale", threshold, ...extra });
const bill = (threshold: string, extra: Record<string, string> = {}) =>
  form({ intent: "create", kind: "bill_above", threshold, ...extra });

describe("parseAlertForm create", () => {
  it("parses a rule with the default reminder interval and no label", () => {
    expect(parseAlertForm(stale("30"))).toEqual({
      intent: "create",
      kind: "live_stale",
      threshold: 30,
      label: null,
      renotify_hours: ALERT_RENOTIFY_DEFAULT_HOURS,
    });
  });

  it("trims the label and turns a blank one into null", () => {
    expect(parseAlertForm(bill("500", { label: "  Dom  " }))).toMatchObject({ label: "Dom" });
    expect(parseAlertForm(bill("500", { label: " \t " }))).toMatchObject({ label: null });
  });

  it("accepts a decimal comma for a bill threshold", () => {
    expect(parseAlertForm(bill("250,5"))).toMatchObject({ threshold: 250.5 });
  });

  it.each([
    ["live_stale", String(ALERT_STALE_MIN_MINUTES), true],
    ["live_stale", String(ALERT_STALE_MIN_MINUTES - 1), false],
    ["live_stale", String(ALERT_STALE_MAX_MINUTES), true],
    ["live_stale", String(ALERT_STALE_MAX_MINUTES + 1), false],
    ["live_stale", "30.5", false],
    ["bill_above", String(ALERT_BILL_MIN_PLN), true],
    ["bill_above", "0.99", false],
    ["bill_above", String(ALERT_BILL_MAX_PLN), true],
    ["bill_above", String(ALERT_BILL_MAX_PLN + 0.01), false],
    ["bill_above", "250.5", true],
  ])("%s threshold %s is accepted: %s", (kind, threshold, accepted) => {
    const parsed = parseAlertForm(form({ intent: "create", kind, threshold }));
    expect(parsed !== "invalid").toBe(accepted);
  });

  it.each(["", "abc", "NaN", "Infinity", " "])("rejects the threshold %j", (threshold) => {
    expect(parseAlertForm(bill(threshold))).toBe("invalid");
  });

  it("rejects a missing threshold and an unknown or missing kind", () => {
    expect(parseAlertForm(form({ intent: "create", kind: "bill_above" }))).toBe("invalid");
    expect(parseAlertForm(form({ intent: "create", kind: "battery", threshold: "30" }))).toBe("invalid");
    expect(parseAlertForm(form({ intent: "create", threshold: "30" }))).toBe("invalid");
  });

  it("accepts a label of exactly the maximum length and rejects one over it", () => {
    expect(parseAlertForm(bill("500", { label: "x".repeat(ALERT_LABEL_MAX_LENGTH) }))).not.toBe("invalid");
    expect(parseAlertForm(bill("500", { label: "x".repeat(ALERT_LABEL_MAX_LENGTH + 1) }))).toBe("invalid");
  });

  it("trims before the length check", () => {
    const label = `  ${"x".repeat(ALERT_LABEL_MAX_LENGTH)}  `;
    expect(parseAlertForm(bill("500", { label }))).toMatchObject({ label: "x".repeat(ALERT_LABEL_MAX_LENGTH) });
  });

  it.each([
    [String(ALERT_RENOTIFY_MIN_HOURS), true],
    [String(ALERT_RENOTIFY_MIN_HOURS - 1), false],
    [String(ALERT_RENOTIFY_MAX_HOURS), true],
    [String(ALERT_RENOTIFY_MAX_HOURS + 1), false],
    ["2.5", false],
    ["abc", false],
  ])("reminder interval %s is accepted: %s", (hours, accepted) => {
    expect(parseAlertForm(bill("500", { renotify_hours: hours })) !== "invalid").toBe(accepted);
  });

  it("uses the default interval for a blank one", () => {
    expect(parseAlertForm(bill("500", { renotify_hours: "" }))).toMatchObject({
      renotify_hours: ALERT_RENOTIFY_DEFAULT_HOURS,
    });
  });
});

describe("parseAlertForm update, toggle, delete", () => {
  const update = {
    intent: "update",
    id: "7",
    kind: "bill_above",
    threshold: "600",
    label: "Dom",
    renotify_hours: "12",
  };

  it("parses an update with its id", () => {
    expect(parseAlertForm(form(update))).toEqual({
      intent: "update",
      id: 7,
      kind: "bill_above",
      threshold: 600,
      label: "Dom",
      renotify_hours: 12,
    });
  });

  it("checks an update's threshold against its kind", () => {
    expect(parseAlertForm(form({ ...update, kind: "live_stale", threshold: "10" }))).toBe("invalid");
    expect(parseAlertForm(form({ ...update, threshold: String(ALERT_BILL_MAX_PLN + 1) }))).toBe("invalid");
  });

  it.each(["", "0", "-1", "1.5", "abc"])("rejects the id %j", (id) => {
    expect(parseAlertForm(form({ ...update, id }))).toBe("invalid");
    expect(parseAlertForm(form({ intent: "delete", id }))).toBe("invalid");
    expect(parseAlertForm(form({ intent: "toggle", id, enabled: "true" }))).toBe("invalid");
  });

  it("parses a toggle to either state and a delete without any other field", () => {
    expect(parseAlertForm(form({ intent: "toggle", id: "7", enabled: "true" }))).toEqual({
      intent: "toggle",
      id: 7,
      enabled: true,
    });
    expect(parseAlertForm(form({ intent: "toggle", id: "7", enabled: "false" }))).toEqual({
      intent: "toggle",
      id: 7,
      enabled: false,
    });
    expect(parseAlertForm(form({ intent: "delete", id: "7" }))).toEqual({ intent: "delete", id: 7 });
  });

  it("rejects a toggle without a clear state", () => {
    expect(parseAlertForm(form({ intent: "toggle", id: "7" }))).toBe("invalid");
    expect(parseAlertForm(form({ intent: "toggle", id: "7", enabled: "yes" }))).toBe("invalid");
  });

  it.each(["", "archive", "CREATE"])("rejects the intent %j and a form without one", (intent) => {
    expect(parseAlertForm(form({ intent, kind: "bill_above", threshold: "500" }))).toBe("invalid");
    expect(parseAlertForm(form({ kind: "bill_above", threshold: "500" }))).toBe("invalid");
  });
});

describe("handleAlertPost", () => {
  it("creates an enabled-by-default rule and reports it", async () => {
    const d = deps();
    expect(await handleAlertPost(stale("30", { label: " Lab ", renotify_hours: "3" }), d)).toEqual(
      redirectTo("created"),
    );
    expect(d.create).toHaveBeenCalledWith({ kind: "live_stale", threshold: 30, label: "Lab", renotify_hours: 3 });
  });

  it("updates the rule's settings without sending a kind", async () => {
    const d = deps();
    const fields = { intent: "update", id: "7", kind: "bill_above", threshold: "600", label: "", renotify_hours: "6" };
    expect(await handleAlertPost(form(fields), d)).toEqual(redirectTo("updated"));
    expect(d.update).toHaveBeenCalledWith(7, { threshold: 600, label: null, renotify_hours: 6 });
  });

  it("toggles and deletes by id", async () => {
    const d = deps();
    expect(await handleAlertPost(form({ intent: "toggle", id: "7", enabled: "false" }), d)).toEqual(
      redirectTo("toggled"),
    );
    expect(d.setEnabled).toHaveBeenCalledWith(7, false);
    expect(await handleAlertPost(form({ intent: "delete", id: "7" }), d)).toEqual(redirectTo("deleted"));
    expect(d.remove).toHaveBeenCalledWith(7);
  });

  it("returns invalid without a database call", async () => {
    const d = deps();
    expect(await handleAlertPost(stale("5"), d)).toEqual(redirectTo("invalid"));
    expect(d.create).not.toHaveBeenCalled();
    expect(d.logError).not.toHaveBeenCalled();
  });

  it("maps a unique violation to duplicate, for a create and an update, without logging", async () => {
    const d = deps({ message: "synthetic duplicate key", code: "23505" });
    expect(await handleAlertPost(bill("500"), d)).toEqual(redirectTo("duplicate"));
    const fields = { intent: "update", id: "7", kind: "bill_above", threshold: "600", renotify_hours: "6" };
    expect(await handleAlertPost(form(fields), d)).toEqual(redirectTo("duplicate"));
    expect(d.logError).not.toHaveBeenCalled();
  });

  it("logs any other database error and reports failed", async () => {
    const error = { message: "synthetic check violation", code: "23514" };
    const d = deps(error);
    expect(await handleAlertPost(bill("500"), d)).toEqual(redirectTo("failed"));
    expect(d.logError).toHaveBeenCalledWith("alert rule create failed", error);
  });

  it("reports a failed toggle and delete", async () => {
    const d = deps({ message: "synthetic database error" });
    expect(await handleAlertPost(form({ intent: "toggle", id: "7", enabled: "true" }), d)).toEqual(
      redirectTo("failed"),
    );
    expect(await handleAlertPost(form({ intent: "delete", id: "7" }), d)).toEqual(redirectTo("failed"));
    expect(d.logError).toHaveBeenCalledWith(
      "alert rule delete failed",
      expect.objectContaining({ message: "synthetic database error" }),
    );
  });

  it("reports a thrown write as failed", async () => {
    const d = deps();
    const cause = new Error("synthetic network error");
    d.create.mockRejectedValueOnce(cause);
    expect(await handleAlertPost(bill("500"), d)).toEqual(redirectTo("failed"));
    expect(d.logError).toHaveBeenCalledWith("alert rule create failed", cause);
  });
});

describe("alertRedirect", () => {
  it("goes back to the alerts page with the outcome", () => {
    expect(alertRedirect("failed")).toEqual(redirectTo("failed"));
  });
});

describe("alertNotice", () => {
  it.each([
    ["created", "good"],
    ["updated", "good"],
    ["toggled", "good"],
    ["deleted", "good"],
    ["duplicate", "problem"],
    ["invalid", "problem"],
    ["failed", "problem"],
  ] as const)("maps %s to its %s notice", (param, tone) => {
    expect(alertNotice(param)).toEqual({ tone, text: ALERT_NOTICES[param] });
  });

  it("pins the Polish copy", () => {
    expect(ALERT_NOTICES).toEqual({
      created: "Reguła dodana.",
      updated: "Reguła zapisana.",
      toggled: "Stan reguły zmieniony.",
      deleted: "Reguła usunięta.",
      duplicate: "Taka reguła już istnieje: ten sam rodzaj i próg.",
      invalid: "Reguła ma niepoprawne dane. Sprawdź próg, nazwę i odstęp między przypomnieniami.",
      failed: "Nie udało się zapisać reguły. Spróbuj ponownie.",
    });
  });

  it.each([null, "", "toString", "CREATED", "other"])("shows nothing for %j", (param) => {
    expect(alertNotice(param)).toBeNull();
  });
});

describe("formatAlertThreshold", () => {
  it("says what the threshold means for each kind", () => {
    expect(formatAlertThreshold("live_stale", 30)).toBe("starsze niż 30 min");
    expect(formatAlertThreshold("bill_above", 250.5)).toBe("powyżej 250,5 zł");
    expect(Object.keys(ALERT_KIND_LABELS)).toEqual(["live_stale", "bill_above"]);
  });
});
