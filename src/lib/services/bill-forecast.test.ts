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

// Gaps found by mutation testing: pushed jsonb is untrusted, so each guard below is pinned from both sides.
describe("toBillForecastView input guards", () => {
  // `String(["2026-09"])` is "2026-09", so a value that merely stringifies to a key must still be refused.
  it("treats a month key that is not a string as unreadable, not as the current month", () => {
    const view = forecast(okRow({ month: ["2026-09"] }));
    expect(view.monthLabel).toBe("—");
    expect(view.isOtherMonth).toBe(false);
    // The day share falls back to the Warsaw month now (September, 30 days), not to the array.
    expect(view.days).toEqual({ used: 15, inMonth: 30, label: "15 z 30", share: 0.5 });
  });

  it.each([
    ["a prefix", "x2026-09"],
    ["a suffix", "2026-09-23"],
    ["month 13", "2026-13"],
  ])("shows no month label for a month key with %s", (_name, month) => {
    expect(forecast(okRow({ month })).monthLabel).toBe("—");
  });

  it("counts the days of the body's own month, not of the current one", () => {
    // August has 31 days; "now" is in September.
    const view = forecast(okRow({ month: "2026-08" }));
    expect(view.isOtherMonth).toBe(true);
    expect(view.days).toEqual({ used: 15, inMonth: 31, label: "15 z 31", share: 15 / 31 });
  });

  it.each([
    ["a prefix", "x2026-09-23"],
    ["a suffix", "2026-09-23T10:00"],
    ["a value that is not a string", ["2026-09-23"]],
  ])("shows no verification date for %s", (_name, verifiedOn) => {
    const view = forecast(okRow({ pricing: { ...pricing, rates_verified_on: verifiedOn } }));
    expect(view.basis.ratesVerifiedOnLabel).toBe("—");
  });

  it.each([
    ["a prefix", "x01.08.2026 - 31.08.2026"],
    ["a suffix", "01.08.2026 - 31.08.2026x"],
    ["a first month of 13", "01.13.2026 - 31.08.2026"],
  ])("does not read a settled period with %s", (_name, period) => {
    const view = forecast(okRow({ settlement: { ...settlement, reference_period: period } }));
    expect(view.basis.referenceMonthLabel).toBe("—");
  });

  it("refuses a generated_at that is not a string even when it stringifies to a date", () => {
    expect(refusal(okRow({ generated_at: ["2026-09-23T11:55:00+02:00"] })).status).toEqual({
      tone: "problem",
      label: "nieznany czas wyliczenia",
    });
  });

  it("does not look up a no_data reason that is not a string", () => {
    const view = refusal(rowOf({ ...noData, reason: ["rates_unavailable"] }));
    expect(view.status).toEqual({ tone: "insufficient", label: "" });
    expect(view.reason).toContain("Nie znamy w tej chwili kwoty za ten miesiąc");
  });

  it("falls back to a blank neutral badge for a confidence it does not know", () => {
    expect(forecast(okRow({ confidence: "certain" })).confidence).toEqual({ tone: "insufficient", label: "" });
    expect(forecast(okRow({ confidence: ["high"] })).confidence).toEqual({ tone: "insufficient", label: "" });
  });

  it("says 1 dzień, not 1 dni, for a single observed day", () => {
    const view = refusal(okRow({ observed_days: observedDays(1), completed_days_used: 1 }));
    expect(view.reason).toContain("jest 1 dzień z 7 potrzebnych");
  });
});

describe("toBillForecastView range and plausibility edges", () => {
  it.each([
    ["without a low end", { high: 360.4 }],
    ["without a high end", { low: 155.08 }],
  ])("refuses a range %s", (_name, range) => {
    expect(refusal(okRow({ range_gross_pln: range })).status).toEqual({
      tone: "problem",
      label: "kwoty nie da się odczytać",
    });
  });

  it("keeps a range whose ends are equal to the central figure", () => {
    const view = forecast(okRow({ projected_bill_gross_pln: 200, range_gross_pln: { low: 200, high: 200 } }));
    expect(view.rangeLabel).toBe("od 200 zł do 200 zł");
  });

  it("says the lower end is above the upper one for a reversed range", () => {
    const view = refusal(okRow({ range_gross_pln: { low: 360.4, high: 155.08 } }));
    expect(view.reason).toContain("dolna kwota wyszła wyżej niż górna");
  });

  it("keeps a figure of exactly the plausibility ceiling and blanks one grosz above it", () => {
    const at = { projected_bill_gross_pln: 257.73, range_gross_pln: { low: 155.08, high: 7000 } };
    expect(forecast(okRow(at)).rangeLabel).toBe("od 155 zł do 7000 zł");
    expect(refusal(okRow({ ...at, range_gross_pln: { low: 155.08, high: 7000.01 } })).status.label).toBe(
      "nierealna kwota",
    );
  });
});

describe("toBillForecastView closed-month check and delta rounding", () => {
  it("passes the check's own ok flag through, in both directions", () => {
    const check = (flag: boolean) => ({ ...ok.closed_month_check, ok: flag });
    expect(forecast(okRow({ closed_month_check: check(true) })).closedMonthCheck?.ok).toBe(true);
    expect(forecast(okRow({ closed_month_check: check(false) })).closedMonthCheck?.ok).toBe(false);
  });

  it.each([
    [3, "+3,0%"],
    [0, "0,0%"],
    [-2.7, "−2,7%"],
  ])("writes a closed-month difference of %d as %s", (diff, label) => {
    const view = forecast(okRow({ closed_month_check: { ...ok.closed_month_check, diff_pct: diff } }));
    expect(view.closedMonthCheck?.diffLabel).toBe(label);
  });

  // Half a percent sits on the rounding line; it rounds away from zero on both sides.
  it.each([
    [201, 200, "+1 zł (+1%) względem ostatniego rachunku za sierpień 2026", "up"],
    [199, 200, "−1 zł (−1%) względem ostatniego rachunku za sierpień 2026", "down"],
  ])("rounds half a percent away from zero (%d against %d)", (projected, invoice, text, direction) => {
    const view = forecast(
      okRow({
        projected_bill_gross_pln: projected,
        range_gross_pln: { low: 100, high: 300 },
        closed_month_check: { ...ok.closed_month_check, invoice_gross_pln: invoice },
      }),
    );
    expect(view.delta).toMatchObject({ text, direction });
  });
});

describe("toBillForecastView plausibility ceiling on the central figure and the closed-month amounts", () => {
  // The range is ordered before the ceiling is checked, so a central or low end above the ceiling always drags the
  // high end above it too. The central and low cases below are therefore the ordered ranges that sit on the line.
  it.each([
    ["central", { projected_bill_gross_pln: 7000, range_gross_pln: { low: 155.08, high: 7000 } }],
    ["low end", { projected_bill_gross_pln: 7000, range_gross_pln: { low: 7000, high: 7000 } }],
  ])("keeps a %s of exactly 7000 PLN", (_name, fields) => {
    expect(forecast(okRow(fields)).centralLabel).toBe("ok. 7000 zł");
  });

  it.each([
    ["central", { projected_bill_gross_pln: 7000.01, range_gross_pln: { low: 155.08, high: 7000.01 } }],
    ["low end", { projected_bill_gross_pln: 7000.01, range_gross_pln: { low: 7000.01, high: 7000.01 } }],
  ])("blanks the figure when the %s is 1 grosz above 7000 PLN", (_name, fields) => {
    const view = refusal(okRow(fields));
    expect(view.status).toEqual({ tone: "problem", label: "nierealna kwota" });
    expect(view.reason).toContain("7000 zł");
  });

  it("blanks a central figure far above the ceiling even when the range is ordered around it", () => {
    const view = refusal(
      okRow({ projected_bill_gross_pln: 41_000_000, range_gross_pln: { low: 155.08, high: 41_000_001 } }),
    );
    expect(view.status).toEqual({ tone: "problem", label: "nierealna kwota" });
  });

  // The contract has no ceiling on these two amounts, so a push carrying one is stored; the card must not show a
  // normal verdict computed against an inflated invoice.
  it.each([
    ["computed amount alone", { computed_gross_pln: 7000.01 }],
    ["invoice amount alone", { invoice_gross_pln: 7000.01 }],
  ])("blanks the figure when the closed-month %s is above the ceiling", (_name, amounts) => {
    const view = refusal(okRow({ closed_month_check: { ...ok.closed_month_check, ...amounts } }));
    expect(view.status).toEqual({ tone: "problem", label: "nierealna kwota" });
    expect(view.reason).toContain("7000 zł");
  });

  it("keeps a closed-month computed amount and invoice of exactly 7000 PLN", () => {
    const view = forecast(
      okRow({ closed_month_check: { ...ok.closed_month_check, computed_gross_pln: 7000, invoice_gross_pln: 7000 } }),
    );
    // 257.73 is below the 7000 PLN invoice, so the verdict is good.
    expect(view.status).toEqual({ tone: "good", label: "nie więcej niż ostatni rachunek (7000 zł)" });
  });

  // The ceiling sits before the day count, so the more serious refusal wins over "too few days".
  it("reports an implausible closed-month amount rather than the day count when both apply", () => {
    const view = refusal(
      okRow({
        completed_days_used: 6,
        observed_days: observedDays(6),
        closed_month_check: { ...ok.closed_month_check, invoice_gross_pln: 7000.01 },
      }),
    );
    expect(view.status).toEqual({ tone: "problem", label: "nierealna kwota" });
  });

  it("still shows the day count when the closed-month amounts are plausible", () => {
    const view = refusal(okRow({ completed_days_used: 6, observed_days: observedDays(6) }));
    expect(view.status).toEqual({ tone: "insufficient", label: "" });
  });
});

// Defence in depth: the ingest contract already rejects a negative central, low or high with a 422, so these bodies
// can only come from a stored row that skipped validation (a direct database write). The view model does not trust
// stored jsonb, so it must refuse them as well.
describe("toBillForecastView defence in depth against a negative figure", () => {
  it.each([
    ["central", { projected_bill_gross_pln: -1, range_gross_pln: { low: 155.08, high: 360.4 } }],
    ["low end", { projected_bill_gross_pln: 200, range_gross_pln: { low: -1, high: 360.4 } }],
    ["high end", { projected_bill_gross_pln: 200, range_gross_pln: { low: 155.08, high: -1 } }],
    ["central, low and high", { projected_bill_gross_pln: -3, range_gross_pln: { low: -5, high: -1 } }],
  ])("refuses a negative %s with its own label, not as a reversed range", (_name, fields) => {
    const view = refusal(okRow(fields));
    expect(view.status).toEqual({ tone: "problem", label: "ujemna kwota" });
    expect(view.reason).toContain("ujemna");
  });

  it("keeps a central, low and high of exactly zero", () => {
    const view = forecast(okRow({ projected_bill_gross_pln: 0, range_gross_pln: { low: 0, high: 0 } }));
    expect(view.centralLabel).toBe("ok. 0 zł");
  });
});

describe("toBillForecastView other-month relabel through a real Warsaw rollover", () => {
  // Generated at 23:58 CEST on 30 September (21:58Z) and read at 00:05 CEST on 1 October (22:05Z). The UTC date is
  // still 30 September, so only the Warsaw day key makes this another month.
  const lastDay = { month: "2026-09", generated_at: "2026-09-30T23:58:00+02:00" };

  it("relabels a fresh September forecast read just after midnight on 1 October", () => {
    const view = forecast(okRow(lastDay), at("2026-09-30T22:05:00Z"));
    expect(view.isOtherMonth).toBe(true);
    expect(view.status).toEqual({ tone: "problem", label: "to prognoza za wrzesień 2026, nie za bieżący miesiąc" });
    // Relabelled, not withheld: the figure and the day share (30 days of September) stay.
    expect(view.centralLabel).toBe("ok. 258 zł");
    expect(view.days).toEqual({ used: 15, inMonth: 30, label: "15 z 30", share: 0.5 });
    expect(view.delta).toBeNull();
  });

  it("does not relabel the same body one minute before Warsaw midnight", () => {
    // 21:59:00Z is 23:59 in Warsaw, still 30 September.
    const view = forecast(okRow(lastDay), at("2026-09-30T21:59:00Z"));
    expect(view.isOtherMonth).toBe(false);
    expect(view.status.label).toBe("ponad 20% powyżej ostatniego rachunku (215 zł)");
  });

  it("relabels a forecast for a month that has not begun yet", () => {
    const view = forecast(okRow({ month: "2026-10" }));
    expect(view.isOtherMonth).toBe(true);
    expect(view.status).toEqual({ tone: "problem", label: "to prognoza za październik 2026, nie za bieżący miesiąc" });
    expect(view.days).toEqual({ used: 15, inMonth: 31, label: "15 z 31", share: 15 / 31 });
  });

  it("rolls over the year: a December forecast read on 1 January", () => {
    // Generated 23:58 CET on 31 December (22:58Z), read at 00:05 CET on 1 January (23:05Z).
    const view = forecast(
      okRow({ month: "2026-12", generated_at: "2026-12-31T23:58:00+01:00" }),
      at("2026-12-31T23:05:00Z"),
    );
    expect(view.isOtherMonth).toBe(true);
    expect(view.status.label).toBe("to prognoza za grudzień 2026, nie za bieżący miesiąc");
  });
});

describe("toBillForecastView closed-month check that failed its own test", () => {
  // `ok: false` tests the lab's arithmetic, not the estimate: the verdict, the delta and the badge stay as they are.
  it("keeps the verdict, the delta and the status of a check with ok true", () => {
    const failed = forecast(okRow({ closed_month_check: { ...ok.closed_month_check, diff_pct: -9.5, ok: false } }));
    const passed = forecast(okRow());
    expect(failed.closedMonthCheck?.ok).toBe(false);
    expect(failed.status).toEqual(passed.status);
    expect(failed.delta).toEqual(passed.delta);
    expect(failed.confidence).toEqual(passed.confidence);
    expect(failed.centralLabel).toBe(passed.centralLabel);
  });
});

// Known gaps, pinned so that a later fix flips them knowingly (docs: Phase 4 of this change). The contract accepts
// both bodies, and no view-model guard ties the central figure to its own inputs or bounds it from below.
describe("toBillForecastView known gaps (not yet guarded)", () => {
  it("KNOWN GAP: shows a central figure inconsistent with its own billable kWh, rate and fee", () => {
    // Hand arithmetic (docs/logic.md): bill = billable kWh x rate + fee = 193.9 x 1.0991 + 44.62 = 213.1 + 44.62
    // = about 257.7 PLN. The body says 120 (range 100 to 150) next to the same 193.9 kWh, which the lab would never
    // publish; the card shows it with a normal status.
    const view = forecast(okRow({ projected_bill_gross_pln: 120, range_gross_pln: { low: 100, high: 150 } }));
    expect(view.centralLabel).toBe("ok. 120 zł");
    expect(view.rangeLabel).toBe("od 100 zł do 150 zł");
    expect(view.status.tone).toBe("good");
  });

  it("KNOWN GAP: shows a central figure below the fixed monthly fee of 44,62 zł", () => {
    // The fee is due whatever the meter says (docs/logic.md), so no honest bill is below 44.62 PLN.
    const view = forecast(okRow({ projected_bill_gross_pln: 20, range_gross_pln: { low: 10, high: 30 } }));
    expect(view.centralLabel).toBe("ok. 20 zł");
    expect(view.status.tone).toBe("good");
  });
});

// Every expectation below is hand arithmetic from docs/logic.md ("What the app shows (S-07)"), not read off the code:
// the verdict compares the whole-złoty amounts the card shows (at or below the invoice is good), then the exact
// central against invoice x 1.2 (up to it is watch, above is problem); the delta is round(central) - round(invoice)
// with the percent central / invoice - 1 rounded half away from zero, one decimal on the +20% line.
describe("toBillForecastView verdict and delta, hand-computed", () => {
  const against = "względem ostatniego rachunku za sierpień 2026";

  function check(central: number, invoice: number) {
    return forecast(
      okRow({
        projected_bill_gross_pln: central,
        range_gross_pln: { low: central / 2, high: central * 1.5 },
        closed_month_check: { ...ok.closed_month_check, invoice_gross_pln: invoice },
      }),
    );
  }

  it.each([
    // Invoice 312.40 -> 312 zł. +20% line: 312.40 x 1.2 = 374.88. Central 374.88 is exactly on it -> watch.
    // Whole złoty: 375 - 312 = +63. Percent 374.88 / 312.40 - 1 = 0.20 -> 20, on the line, milder -> "+20,0%".
    [374.88, 312.4, "watch", "do 20% powyżej ostatniego rachunku (312 zł)", `+63 zł (+20,0%) ${against}`, "up"],
    // One grosz above the line: 374.89 > 374.88 -> problem. 375 - 312 = +63. Percent 20.003 -> whole 20 on the
    // line, past it -> at least "+20,1%".
    [374.89, 312.4, "problem", "ponad 20% powyżej ostatniego rachunku (312 zł)", `+63 zł (+20,1%) ${against}`, "up"],
    // Invoice 150.40 -> 150 zł, central 150.45 -> 150 zł: equal in whole złoty -> good, delta 0 -> "bez zmian".
    [150.45, 150.4, "good", "nie więcej niż ostatni rachunek (150 zł)", `bez zmian ${against}`, "flat"],
    // Central 150.60 -> 151 zł against 150 zł: above in whole złoty, inside +20% (180.48) -> watch. +1 zł; percent
    // 150.60 / 150.40 - 1 = 0.13% rounds to 0, so no percent is shown.
    [150.6, 150.4, "watch", "do 20% powyżej ostatniego rachunku (150 zł)", `+1 zł ${against}`, "up"],
    // Decrease: 310 against 400 -> -90 zł. Percent 310 / 400 - 1 = -22.5, half away from zero -> -23.
    [310, 400, "good", "nie więcej niż ostatni rachunek (400 zł)", `−90 zł (−23%) ${against}`, "down"],
    // Far above: 600 against 400 -> 400 x 1.2 = 480 < 600 -> problem. +200 zł, percent +50.
    [600, 400, "problem", "ponad 20% powyżej ostatniego rachunku (400 zł)", `+200 zł (+50%) ${against}`, "up"],
  ])("rates %d against an invoice of %d as %s", (central, invoice, tone, label, text, direction) => {
    const view = check(central, invoice);
    expect(view.status).toEqual({ tone, label });
    expect(view.delta).toEqual({ text, tone, direction });
  });

  // Display rounding to whole złoty, half away from zero: 99.5 -> 100, 150.5 -> 151, 411.49 -> 411.
  it("shows money in whole złoty with halves rounded up", () => {
    const view = forecast(okRow({ projected_bill_gross_pln: 150.5, range_gross_pln: { low: 99.5, high: 411.49 } }));
    expect(view.centralLabel).toBe("ok. 151 zł");
    expect(view.rangeLabel).toBe("od 100 zł do 411 zł");
  });

  // 7-day rule: the count is the days listed. 6 days -> refused with "jest 6 dni z 7", 7 days -> shown, even when
  // the body claims the other number.
  it.each([
    [6, 7, "refused"],
    [7, 6, "shown"],
  ])("with %d observed days and a claimed %d the figure is %s", (observed, claimed, outcome) => {
    const r = okRow({ completed_days_used: claimed, observed_days: observedDays(observed) });
    if (outcome === "shown") expect(forecast(r).dayLabel).toBe("7 dni: 1–7 września");
    else expect(refusal(r).reason).toContain("jest 6 dni z 7 potrzebnych");
  });
});
