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
      delta: {
        text: "+43 zł (+20,1%) względem ostatniego rachunku za sierpień 2026",
        tone: "problem",
        direction: "up",
      },
      days: { used: 15, inMonth: 30, label: "15 z 30", share: 0.5 },
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

  it("does not mistake an inherited property name for a known no_data reason", () => {
    const view = refusal(rowOf({ ...noData, reason: "constructor" }));
    expect(view.status).toEqual({ tone: "insufficient", label: "" });
    expect(view.reason).toContain("Nie znamy w tej chwili kwoty");
  });

  // A no_data body carries generated_at too: a last "the month has just begun" kept for weeks must not look current.
  it("shows a stale no_data body as stale, not as its old reason", () => {
    const view = refusal(rowOf(noData), at("2026-09-23T10:25:01Z"));
    expect(view.status).toEqual({ tone: "problem", label: "wyliczona 30 min temu" });
    expect(view.reason).not.toContain("po pierwszym pełnym dniu");
  });

  it("still shows the reason of a fresh no_data body", () => {
    expect(refusal(rowOf(noData), at("2026-09-23T10:25:00Z")).reason).toContain("po pierwszym pełnym dniu");
  });

  it("flags a no_data body dated in the future or without a time", () => {
    expect(refusal(rowOf(noData), at("2026-09-23T09:49:59Z")).status.label).toBe("czas wyliczenia z przyszłości");
    expect(refusal(rowOf({ ...noData, generated_at: undefined })).status.label).toBe("nieznany czas wyliczenia");
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

  // generated_at is 2026-09-23T09:55:00Z; the app clock may run up to 5 minutes behind it before it is a clock error.
  it("keeps a forecast generated up to 5 minutes ahead of the app clock", () => {
    expect(forecast(okRow(), at("2026-09-23T09:50:00Z")).centralLabel).toBe("ok. 258 zł");
  });

  it("blanks the figure when generated_at is more than 5 minutes ahead of the app clock", () => {
    const view = refusal(okRow(), at("2026-09-23T09:49:59Z"));
    expect(view.status).toEqual({ tone: "problem", label: "czas wyliczenia z przyszłości" });
    expect(view.reason).toContain("z przyszłości");
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

  // Both sides read "215 zł", so the verdict must not say "powyżej" between them.
  it("rates a central 214.9 against an invoice of 214.66 as not more than the invoice", () => {
    const view = forecast(okRow({ projected_bill_gross_pln: 214.9 }));
    expect(view.centralLabel).toBe("ok. 215 zł");
    expect(view.status).toEqual({ tone: "good", label: "nie więcej niż ostatni rachunek (215 zł)" });
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

  it.each([
    ["below the range", { projected_bill_gross_pln: 100, range_gross_pln: { low: 155.08, high: 360.4 } }],
    ["above the range", { projected_bill_gross_pln: 400, range_gross_pln: { low: 155.08, high: 360.4 } }],
    ["outside a narrow range", { projected_bill_gross_pln: 300, range_gross_pln: { low: 100, high: 200 } }],
  ])("blanks the figure when the central estimate is %s", (_name, fields) => {
    expect(refusal(okRow(fields)).status).toEqual({ tone: "problem", label: "sprzeczne dane" });
  });

  it.each([
    ["at the low end", 155.08],
    ["at the high end", 360.4],
  ])("keeps the figure when the central estimate is %s of the range", (_name, central) => {
    expect(forecast(okRow({ projected_bill_gross_pln: central })).rangeLabel).toBe("od 155 zł do 360 zł");
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

  it.each(["projected_import_kwh", "projected_credit_kwh", "projected_billable_kwh", "credit_left_kwh"])(
    "blanks the figure when the derived %s is negative",
    (field) => {
      const view = refusal(okRow({ [field]: -0.5 }));
      expect(view.status).toEqual({ tone: "problem", label: "błędne dane w wyliczeniu" });
      expect(view.reason).toContain("ujemne lub nieczytelne");
    },
  );

  it("blanks the figure when a derived kWh figure is not finite", () => {
    expect(refusal(okRow({ projected_credit_kwh: Infinity })).status.label).toBe("błędne dane w wyliczeniu");
  });

  it("keeps a zero derived kWh figure", () => {
    expect(forecast(okRow({ projected_credit_kwh: 0, credit_left_kwh: 0 })).centralLabel).toBe("ok. 258 zł");
  });

  it("blanks the figure when the amount itself is not a number", () => {
    expect(refusal(okRow({ projected_bill_gross_pln: null })).status).toEqual({
      tone: "problem",
      label: "kwoty nie da się odczytać",
    });
  });

  it("falls back to the lab's day count when the body has no observed_days list", () => {
    expect(forecast(okRow({ observed_days: undefined })).dayLabel).toBe("15 dni");
  });

  // The count is the days themselves, not the lab's second claim about them.
  it("does not pass the 7-day gate on completed_days_used alone", () => {
    const view = refusal(okRow({ completed_days_used: 20, observed_days: observedDays(3) }));
    expect(view.status).toEqual({ tone: "insufficient", label: "" });
    expect(view.reason).toContain("jest 3 dni z 7 potrzebnych");
  });

  it("labels the period from the observed days, not from completed_days_used", () => {
    expect(forecast(okRow({ completed_days_used: 9, observed_days: observedDays(7) })).dayLabel).toBe(
      "7 dni: 1–7 września",
    );
  });

  it("falls back to the day count when no observed date is readable, without throwing", () => {
    const days = [{ date: "not-a-date", grid_import_kwh: 1 }, { date: 5 }, null, ...observedDays(6)].slice(0, 9);
    expect(forecast(okRow({ observed_days: days })).dayLabel).toBe("6 dni: 1–6 września");
    const allBad = Array.from({ length: 8 }, () => ({ date: "31/12/2026" }));
    expect(forecast(okRow({ observed_days: allBad })).dayLabel).toBe("8 dni");
  });

  it("caps observed_days at the contract maximum", () => {
    const view = forecast(okRow({ observed_days: Array.from({ length: 40 }, () => ({ date: "x" })) }));
    expect(view.dayLabel).toBe("31 dni");
  });

  it("treats a closed_month_check that is not an object as absent", () => {
    for (const value of [null, "2026-08"]) {
      const view = forecast(okRow({ closed_month_check: value }));
      expect(view.closedMonthCheck).toBeNull();
      expect(view.status).toEqual({ tone: "insufficient", label: "brak zamkniętego rachunku do porównania" });
    }
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

  it("omits the reference month from the lag badge when the period is unreadable", () => {
    const view = forecast(
      okRow({
        confidence: "low",
        settlement: { ...settlement, reference_period: "garbage", reference_lag_months: 1 },
      }),
    );
    expect(view.confidence).toEqual({ tone: "insufficient", label: "niska pewność" });
    expect(view.basis).toMatchObject({ referenceMonthLabel: "—", referenceLagMonths: 1 });
  });

  it.each([
    [0, 0],
    [2, 2],
    [12, 12],
    [40, 12],
    [-3, -3],
    ["2", 0],
  ])("reports reference_lag_months %j as %j", (lag, shown) => {
    const view = forecast(okRow({ settlement: { ...settlement, reference_lag_months: lag } }));
    expect(view.basis.referenceLagMonths).toBe(shown);
  });

  it("still gives a lagging body its verdict against the last invoice", () => {
    const view = forecast(
      okRow({
        confidence: "low",
        projected_bill_gross_pln: 230,
        settlement: { ...settlement, reference_period: "2026-07", reference_lag_months: 1 },
      }),
    );
    expect(view.status).toEqual({ tone: "watch", label: "do 20% powyżej ostatniego rachunku (215 zł)" });
    expect(view.confidence.label).toContain("rozliczenie za lipiec 2026");
  });

  // The lab publishes the connector's own period text; the month named is the one the period ends in.
  it("names the settled month from the lab's period text", () => {
    const period = "01.08.2026 - 31.08.2026";
    const view = forecast(
      okRow({
        settlement: { ...settlement, reference_period: period },
        closed_month_check: { ...ok.closed_month_check, period },
      }),
    );
    expect(view.basis.referenceMonthLabel).toBe("sierpień 2026");
    expect(view.closedMonthCheck?.monthLabel).toBe("sierpień 2026");
    expect(forecast(okRow({ settlement: { ...settlement, reference_period: "31.13.2026 - x" } })).basis).toMatchObject({
      referenceMonthLabel: "—",
    });
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

  describe("delta against the last invoice", () => {
    function deltaOf(projected: number, invoice: number, overrides: Record<string, unknown> = {}) {
      return forecast(
        okRow({
          projected_bill_gross_pln: projected,
          closed_month_check: { ...ok.closed_month_check, invoice_gross_pln: invoice },
          ...overrides,
        }),
      ).delta;
    }
    const against = "względem ostatniego rachunku za sierpień 2026";

    it.each([
      [257.73, 214.66, `+43 zł (+20,1%) ${against}`, "problem", "up"],
      [240, 200, `+40 zł (+20,0%) ${against}`, "watch", "up"],
      [240.01, 200, `+40 zł (+20,1%) ${against}`, "problem", "up"],
      // In the band past the line the badge says "ponad 20%", so the percent never reads a bare "+20%".
      [240.6, 200, `+41 zł (+20,3%) ${against}`, "problem", "up"],
      [260, 200, `+60 zł (+30%) ${against}`, "problem", "up"],
      // The negative side has no verdict line, so no decimal.
      [160, 200, `−40 zł (−20%) ${against}`, "good", "down"],
      [180, 200, `−20 zł (−10%) ${against}`, "good", "down"],
      [200, 200, `bez zmian ${against}`, "good", "flat"],
      // Both sides read 215 zł.
      [214.9, 214.66, `bez zmian ${against}`, "good", "flat"],
      // A whole-złoty difference whose percent rounds to 0 carries no percent.
      [215.6, 214.66, `+1 zł ${against}`, "watch", "up"],
      [214.4, 214.66, `−1 zł ${against}`, "good", "down"],
    ])("compares %d with an invoice of %d as %s", (projected, invoice, text, tone, direction) => {
      expect(deltaOf(projected, invoice)).toEqual({ text, tone, direction });
    });

    it("shows the amount only, without dividing, for an invoice of 0 zł", () => {
      expect(deltaOf(50, 0, { range_gross_pln: { low: 10, high: 100 } })).toEqual({
        text: `+50 zł ${against}`,
        tone: "problem",
        direction: "up",
      });
    });

    it("has no delta without an invoice", () => {
      const { closed_month_check: _dropped, ...body } = ok;
      expect(forecast(rowOf(body)).delta).toBeNull();
      const { invoice_gross_pln: _invoice, ...check } = ok.closed_month_check;
      expect(forecast(okRow({ closed_month_check: check })).delta).toBeNull();
    });

    it("has no delta when the invoice month cannot be read", () => {
      expect(forecast(okRow({ closed_month_check: { ...ok.closed_month_check, period: "garbage" } })).delta).toBeNull();
      expect(forecast(okRow({ closed_month_check: { ...ok.closed_month_check, period: undefined } })).delta).toBeNull();
    });

    it("names the invoice's own month when the reference lags", () => {
      const period = "01.07.2026 - 31.07.2026";
      const view = forecast(
        okRow({
          settlement: { ...settlement, reference_period: period, reference_lag_months: 1 },
          closed_month_check: { ...ok.closed_month_check, period },
        }),
      );
      expect(view.delta?.text).toBe("+43 zł (+20,1%) względem ostatniego rachunku za lipiec 2026");
    });

    it("has no delta for a forecast of another month", () => {
      expect(forecast(okRow({ month: "2026-08" })).delta).toBeNull();
    });

    it("carries no delta and no days on any refusal", () => {
      const refusals = [
        rowOf(noData),
        okRow({ projected_bill_gross_pln: null }),
        okRow({ range_gross_pln: { low: 155.08, high: 9500 } }),
        okRow({ completed_days_used: 6, observed_days: observedDays(6) }),
        okRow({ generated_at: "never" }),
        rowOf({ status: "partial" }),
      ];
      for (const r of refusals) {
        const view = refusal(r);
        expect(view).not.toHaveProperty("delta");
        expect(view).not.toHaveProperty("days");
      }
      expect(refusal(okRow(), at("2026-09-23T10:25:01Z"))).not.toHaveProperty("delta");
      expect(refusal(okRow(), at("2026-09-23T09:49:59Z"))).not.toHaveProperty("days");
    });
  });

  describe("days in the estimate", () => {
    // Dates are irrelevant here, only the count and the month key.
    const plainDays = (count: number) => Array.from({ length: count }, () => ({ date: "x" }));
    function daysOf(month: string | undefined, used: number, generatedAt: string, clock: string) {
      return forecast(
        okRow({ month, completed_days_used: used, observed_days: plainDays(used), generated_at: generatedAt }),
        at(clock),
      ).days;
    }

    it("counts 15 of 30 in September", () => {
      expect(forecast(okRow()).days).toEqual({ used: 15, inMonth: 30, label: "15 z 30", share: 0.5 });
    });

    it("counts 28 of 28 in February 2027 and 15 of 29 in February 2028", () => {
      expect(daysOf("2027-02", 28, "2027-02-15T12:00:00+01:00", "2027-02-15T11:05:00Z")).toEqual({
        used: 28,
        inMonth: 28,
        label: "28 z 28",
        share: 1,
      });
      expect(daysOf("2028-02", 15, "2028-02-15T12:00:00+01:00", "2028-02-15T11:05:00Z")).toEqual({
        used: 15,
        inMonth: 29,
        label: "15 z 29",
        share: 15 / 29,
      });
    });

    it("counts 31 of 31 in a 31-day month", () => {
      expect(daysOf("2026-10", 31, "2026-10-31T12:00:00+01:00", "2026-10-31T11:05:00Z")).toEqual({
        used: 31,
        inMonth: 31,
        label: "31 z 31",
        share: 1,
      });
    });

    it("uses the Warsaw month when the body has no month key", () => {
      expect(daysOf(undefined, 15, "2026-09-23T11:55:00+02:00", "2026-09-23T10:00:00Z")?.label).toBe("15 z 30");
    });

    it("has no bar when the body claims more complete days than the month has", () => {
      // 32 observed days are capped at 31, which still exceeds September's 30.
      const view = forecast(okRow({ completed_days_used: 32, observed_days: plainDays(32) }));
      expect(view.dayLabel).toBe("31 dni");
      expect(view.days).toBeNull();
    });

    it("falls back to completed_days_used without a day list", () => {
      expect(forecast(okRow({ observed_days: undefined })).days).toEqual({
        used: 15,
        inMonth: 30,
        label: "15 z 30",
        share: 0.5,
      });
    });
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
