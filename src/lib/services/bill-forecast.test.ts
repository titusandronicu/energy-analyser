import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { BillForecastRow } from "@/types";
import { loadBillForecast, toBillForecastView } from "./bill-forecast";

const row: BillForecastRow = {
  captured_at: "2026-09-28T10:00:00Z",
  received_at: "2026-09-28T10:00:02Z",
  bill_forecast: { status: "ok" },
};

describe("loadBillForecast", () => {
  // Records the arguments of the query chain and resolves with the given result.
  function mockClient(result: { data: BillForecastRow[] | null; error: { message: string } | null }) {
    const calls: Record<string, unknown[]> = {};
    const chain = {
      from: (...args: unknown[]) => ((calls.from = args), chain),
      select: (...args: unknown[]) => ((calls.select = args), chain),
      limit: (...args: unknown[]) => ((calls.limit = args), chain),
      overrideTypes: () => Promise.resolve(result),
    };
    return { client: chain as unknown as SupabaseClient, calls };
  }

  it("reads one row of the bill_forecast view", async () => {
    const { client, calls } = mockClient({ data: [row], error: null });
    await expect(loadBillForecast(client)).resolves.toEqual(row);
    expect(calls.from).toEqual(["bill_forecast"]);
    // The view already picks the newest push carrying a forecast, so the loader only asks for its columns.
    expect(calls.select).toEqual(["captured_at, received_at, bill_forecast"]);
    expect(calls.limit).toEqual([1]);
  });

  it("returns null when no push carries a forecast", async () => {
    const { client } = mockClient({ data: [], error: null });
    await expect(loadBillForecast(client)).resolves.toBeNull();
  });

  it("throws on a query error so the page shows a load failure", async () => {
    const { client } = mockClient({ data: null, error: { message: "permission denied" } });
    await expect(loadBillForecast(client)).rejects.toThrow("loading bill forecast failed: permission denied");
  });
});

// The real September body from docs/ingest/example-v1.json: 549 kWh imported at an export ratio of 0.809 over
// 15 complete days gives 258 PLN, range 155–361 (docs/logic.md, "Bill forecast (lab)").
function observedDays(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
    grid_import_kwh: 18.3,
  }));
}

const settlement = {
  factor: 0.8,
  reference_period: "2026-08",
  reference_lag_months: 0,
  reference_consumed_kwh: 422.7,
  reference_feed_in_kwh: 342,
  export_ratio: 0.809,
  carried_credit_kwh: 0,
  carried_credit_basis: "left_kwh_times_factor",
  carried_credit_dropped_as_stale: false,
  factor_implied: false,
};

const pricing = {
  source: "solar_analyser.tariffs.pge_g11_positions",
  rates_verified_on: "2026-09-23",
  variable_gross_pln_per_kwh: 1.0991,
  fixed_gross_pln_per_month: 44.62,
};

const ok = {
  status: "ok",
  month: "2026-09",
  confidence: "high",
  completed_days_used: 15,
  observed_days: observedDays(15),
  average_daily_import_kwh: 18.3,
  projected_import_kwh: 549,
  projected_bill_gross_pln: 257.73,
  range_gross_pln: { low: 155.08, high: 360.4 },
  projected_credit_kwh: 355.1,
  projected_billable_kwh: 193.9,
  credit_left_kwh: 0,
  settlement,
  pricing,
  closed_month_check: {
    period: "2026-08",
    computed_gross_pln: 208.83,
    invoice_gross_pln: 214.66,
    diff_pct: -2.7,
    ok: true,
  },
  generated_at: "2026-09-23T11:55:00+02:00",
  method: "net_metering_credit_estimate",
};

const noData = {
  status: "no_data",
  reason: "no_complete_days",
  message: "Ten miesiąc nie ma jeszcze ani jednego zakończonego dnia z poprawnym odczytem licznika.",
  generated_at: "2026-09-23T11:55:00+02:00",
  month: "2026-09",
  method: "net_metering_credit_estimate",
};

function rowOf(body: Record<string, unknown>): BillForecastRow {
  return {
    captured_at: "2026-09-23T09:58:00Z",
    received_at: "2026-09-23T09:58:02Z",
    bill_forecast: body,
  };
}

// Warsaw is UTC+2 in late September (CEST), so the body's 11:55 local is 09:55 UTC and "now" is five minutes on.
const at = (iso: string) => new Date(iso);
const now = at("2026-09-23T10:00:00Z");

function okRow(overrides: Record<string, unknown> = {}): BillForecastRow {
  return rowOf({ ...ok, ...overrides });
}

function forecast(r: BillForecastRow, clock: Date = now) {
  const view = toBillForecastView(r, clock);
  if (view.kind !== "forecast") throw new Error(`expected a forecast view, got ${view.kind}`);
  return view;
}

function refusal(r: BillForecastRow, clock: Date = now) {
  const view = toBillForecastView(r, clock);
  if (view.kind !== "unavailable") throw new Error(`expected an unavailable view, got ${view.kind}`);
  return view;
}

describe("toBillForecastView", () => {
  it("returns the empty state without a row", () => {
    expect(toBillForecastView(null, now)).toEqual({
      kind: "empty",
      status: { tone: "insufficient", label: "laboratorium jeszcze nie przesłało prognozy" },
    });
  });

  it("builds the Polish card for the real September body", () => {
    expect(toBillForecastView(okRow(), now)).toEqual({
      kind: "forecast",
      // 257.73 against the 214.66 PLN invoiced for August is just over +20%.
      status: { tone: "problem", label: "ponad 20% powyżej ostatniego rachunku (215 zł)" },
      monthLabel: "wrzesień 2026",
      isOtherMonth: false,
      rangeLabel: "od 155 zł do 360 zł",
      centralLabel: "ok. 258 zł",
      dayLabel: "15 dni: 1–15 września",
      confidence: { tone: "good", label: "wysoka pewność" },
      creditLeftLabel: null,
      basis: {
        referenceMonthLabel: "sierpień 2026",
        referenceLagMonths: 0,
        exportRatioLabel: "81%",
        rateLabel: "1,0991 zł/kWh",
        fixedFeeLabel: "44,62 zł / mies.",
        ratesVerifiedOnLabel: "23 września",
      },
      closedMonthCheck: {
        monthLabel: "sierpień 2026",
        computedLabel: "209 zł",
        invoiceLabel: "215 zł",
        diffLabel: "−2,7%",
        ok: true,
      },
    });
  });

  // The lab's own refusals come first: a no_data body carries no `completed_days_used`, so any other check
  // running before this one would read a key that is not there.
  it.each([
    ["no_complete_days", "insufficient", "po pierwszym pełnym dniu"],
    ["settlement_facts_missing", "insufficient", "PGE nie rozliczyło jeszcze poprzedniego miesiąca"],
    ["rates_unavailable", "problem", "ceny prądu w Twojej taryfie"],
  ])("explains the lab's %s refusal without a figure", (reason, tone, fragment) => {
    const view = refusal(rowOf({ ...noData, reason }));
    expect(view.status.tone).toBe(tone);
    expect(view.reason).toContain(fragment);
  });

  it("falls back to a general explanation for a no_data reason it does not know", () => {
    const view = refusal(rowOf({ ...noData, reason: "something_new" }));
    expect(view.status).toEqual({ tone: "insufficient", label: "" });
    expect(view.reason).toContain("Nie znamy w tej chwili kwoty");
  });

  it("shows no figure for a body whose status it does not understand", () => {
    expect(refusal(rowOf({ status: "partial" })).status).toEqual({
      tone: "problem",
      label: "nierozpoznane wyliczenie",
    });
  });

  it("is not stale at exactly 30 minutes", () => {
    expect(forecast(okRow(), at("2026-09-23T10:25:00Z")).centralLabel).toBe("ok. 258 zł");
  });

  it("is stale at 30 minutes and 1 second, judged on generated_at", () => {
    const view = refusal(okRow(), at("2026-09-23T10:25:01Z"));
    expect(view.status).toEqual({ tone: "problem", label: "wyliczona 30 min temu" });
    expect(view.reason).toContain("ma już 30 min");
  });

  // Staleness is checked before the day count: an old body must not be reported as a data shortage.
  it("reports staleness rather than the day count when both apply", () => {
    const stale = okRow({ completed_days_used: 3, observed_days: observedDays(3) });
    expect(refusal(stale, at("2026-09-23T11:00:00Z")).status.label).toBe("wyliczona 1 godz. temu");
  });

  it("shows no figure when the body does not say when it was generated", () => {
    expect(refusal(okRow({ generated_at: "never" })).status).toEqual({
      tone: "problem",
      label: "nieznany czas wyliczenia",
    });
  });

  it("shows the grey state below 7 complete days, quoting the reader's own daily usage", () => {
    const view = refusal(okRow({ completed_days_used: 6, observed_days: observedDays(6) }));
    expect(view.status).toEqual({ tone: "insufficient", label: "" });
    expect(view.reason).toContain("jest 6 dni z 7 potrzebnych");
    // The blank card still tells the reader something about their house, not about the pipeline.
    expect(view.reason).toContain("średnio 18,3 kWh dziennie");
  });

  it("drops the usage sentence when the body carries no daily average", () => {
    const view = refusal(
      okRow({ completed_days_used: 6, observed_days: observedDays(6), average_daily_import_kwh: null }),
    );
    expect(view.reason).toContain("jest 6 dni z 7 potrzebnych");
    expect(view.reason).not.toContain("średnio");
  });

  it("shows the figure at exactly 7 complete days", () => {
    const view = forecast(okRow({ completed_days_used: 7, observed_days: observedDays(7) }));
    expect(view.centralLabel).toBe("ok. 258 zł");
    expect(view.dayLabel).toBe("7 dni: 1–7 września");
  });

  // Exactly on a verdict line takes the milder status (docs/logic.md).
  it.each([
    [200, { tone: "good", label: "nie więcej niż ostatni rachunek (200 zł)" }],
    [240, { tone: "watch", label: "do 20% powyżej ostatniego rachunku (200 zł)" }],
    [240.01, { tone: "problem", label: "ponad 20% powyżej ostatniego rachunku (200 zł)" }],
  ])("rates a projected %s PLN against a 200 PLN invoice as %j", (projected, status) => {
    const view = forecast(
      okRow({
        projected_bill_gross_pln: projected,
        closed_month_check: {
          period: "2026-08",
          computed_gross_pln: 196,
          invoice_gross_pln: 200,
          diff_pct: -2,
          ok: true,
        },
      }),
    );
    expect(view.status).toEqual(status);
  });

  it("gives no verdict and no check line without a closed month to compare with", () => {
    const { closed_month_check: _dropped, ...body } = ok;
    const view = forecast(rowOf(body));
    // Never a fallback to the lab's own computed_gross_pln: that would change what the colour means.
    expect(view.status).toEqual({ tone: "insufficient", label: "brak zamkniętego rachunku do porównania" });
    expect(view.closedMonthCheck).toBeNull();
    expect(view.centralLabel).toBe("ok. 258 zł");
  });

  it("blanks the figure when a range end is above the plausibility ceiling", () => {
    const view = refusal(okRow({ range_gross_pln: { low: 155.08, high: 9500 } }));
    expect(view.status).toEqual({ tone: "problem", label: "nierealna kwota" });
    expect(view.reason).toContain("7000 zł");
  });

  it("blanks the figure when the range is reversed", () => {
    expect(refusal(okRow({ range_gross_pln: { low: 360.4, high: 155.08 } })).status).toEqual({
      tone: "problem",
      label: "sprzeczne dane",
    });
  });

  it.each(["reference_consumed_kwh", "reference_feed_in_kwh", "export_ratio"])(
    "blanks the figure when the lab reports a negative %s",
    (field) => {
      const view = refusal(okRow({ settlement: { ...settlement, [field]: -1 } }));
      expect(view.status).toEqual({ tone: "problem", label: "błędne dane z PGE" });
      expect(view.reason).toContain("wyglądają na błędne");
    },
  );

  it("blanks the figure when the amount itself is not a number", () => {
    expect(refusal(okRow({ projected_bill_gross_pln: null })).status).toEqual({
      tone: "problem",
      label: "kwoty nie da się odczytać",
    });
  });

  it.each([
    [[], "15 dni"],
    [undefined, "15 dni"],
  ])("falls back to the bare day count for observed_days %j", (days, expected) => {
    expect(forecast(okRow({ observed_days: days })).dayLabel).toBe(expected);
  });

  it.each([
    ["high", { tone: "good", label: "wysoka pewność" }],
    ["medium", { tone: "watch", label: "średnia pewność" }],
    ["low", { tone: "insufficient", label: "niska pewność" }],
  ])("maps the lab's %s confidence to %j", (confidence, status) => {
    expect(forecast(okRow({ confidence })).confidence).toEqual(status);
  });

  // A lagging reference is the normal state for three weeks of every month, so it is disclosed on the badge
  // rather than hiding the figure.
  it("names the reference month on the badge when the reference lags", () => {
    const view = forecast(
      okRow({
        confidence: "low",
        settlement: { ...settlement, reference_period: "2026-07", reference_lag_months: 1 },
      }),
    );
    expect(view.confidence).toEqual({
      tone: "insufficient",
      label: "niska pewność — rozliczenie za lipiec 2026, nie za ostatni miesiąc",
    });
    expect(view.basis).toMatchObject({ referenceMonthLabel: "lipiec 2026", referenceLagMonths: 1 });
    expect(view.centralLabel).toBe("ok. 258 zł");
  });

  // A forecast generated at 23:58 on the last day of a month and read at 00:05 the next is still fresh.
  it("keeps the figure but drops the badge to a problem for another month", () => {
    const view = forecast(okRow({ month: "2026-08" }));
    expect(view.status).toEqual({ tone: "problem", label: "to prognoza za sierpień 2026, nie za bieżący miesiąc" });
    expect(view.isOtherMonth).toBe(true);
    expect(view.rangeLabel).toBe("od 155 zł do 360 zł");
  });

  it("says when banked credit already covers the month's import", () => {
    expect(forecast(okRow({ credit_left_kwh: 41.5 })).creditLeftLabel).toBe("41,5 kWh");
  });

  it("renders non-numeric values as MISSING instead of a wrong figure", () => {
    const view = forecast(
      okRow({
        credit_left_kwh: null,
        settlement: { ...settlement, export_ratio: "0.809" },
        pricing: { ...pricing, variable_gross_pln_per_kwh: null, fixed_gross_pln_per_month: "44.62" },
        closed_month_check: { ...ok.closed_month_check, diff_pct: null },
      }),
    );
    expect(view.basis).toMatchObject({ exportRatioLabel: "—", rateLabel: "—", fixedFeeLabel: "—" });
    expect(view.closedMonthCheck?.diffLabel).toBe("—");
    expect(view.creditLeftLabel).toBeNull();
  });
});
