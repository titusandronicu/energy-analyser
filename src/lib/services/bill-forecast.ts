import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillForecastRow } from "@/types";
import { formatPeriod } from "@/lib/format/period";
import type { Status, StatusTone } from "@/lib/format/status";
import { asNumber, asRecord, kwhLabel, MISSING, plnLabel } from "@/lib/format/values";
import { formatDayMonth, formatMonth, warsawMonthKey, warsawParts } from "@/lib/format/warsaw-time";
import { formatAge } from "@/lib/services/live-state";

// The lab recomputes the forecast with every 5-minute push, so anything older than half an hour means it has
// stopped computing. Judged against the body's own `generated_at`, never the push's `captured_at`: on a write
// failure nginx kept serving a stale file inside a perfectly fresh push, with the figure 2.4x overstated
// (context/archive/2026-09-27-bill-accuracy/reviews/impl-review-phase-2.md:69). `captured_at` staleness is the
// live state card's job.
export const FORECAST_STALE_AFTER_MS = 30 * 60 * 1000;
// A `generated_at` ahead of this app's clock by more than this is a producer clock error: it would otherwise keep an
// obsolete figure fresh until 30 minutes after that future instant. The same 5-minute skew the ingest contract
// allows for `captured_at`.
export const FORECAST_FUTURE_SKEW_MS = 5 * 60 * 1000;
// Below this many complete days the month is too short to project from, and the card says so instead of
// showing a figure (context/changes/bill-forecast/change.md:14).
export const MIN_COMPLETE_DAYS = 7;
// The lab drops a day reading above 200 kWh as a counter glitch (docs/logic.md), so the most expensive month it
// can honestly report is 200 × 31 × 1.0991 + 44.62 ≈ 6859 PLN. Anything above this is a publisher bug — a
// negative `feed_in_kwh` once produced a 41M-PLN range end — so it blanks this card rather than 422ing the whole
// push, which would stop the live state and the recommendation too.
export const MAX_PLAUSIBLE_BILL_PLN = 7000;
// The verdict bands against the last real invoice: at or below it is good, up to +20% is worth watching, above
// is a problem (context/changes/bill-forecast/change.md:14).
export const BILL_AMBER_RATIO = 1.2;
// Absorbs floating point error so a figure exactly on a verdict line takes the milder status.
const EPSILON = 1e-9;

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type Confidence = "low" | "medium" | "high";

// What the estimate rests on, for the card's "Na podstawie" block. The reference month is the last month PGE
// actually settled; its lag is why the figure re-bases when a new invoice lands.
export interface BillForecastBasis {
  referenceMonthLabel: string;
  referenceLagMonths: number;
  exportRatioLabel: string;
  rateLabel: string;
  fixedFeeLabel: string;
  ratesVerifiedOnLabel: string;
}

// The lab's re-pricing of the reference month against its real invoice. It tests the arithmetic, not the
// estimate, so the card words it that way; absent when that month carries no invoice total.
export interface ClosedMonthCheckView {
  monthLabel: string;
  computedLabel: string;
  invoiceLabel: string;
  diffLabel: string;
  ok: boolean;
}

export type BillForecastView =
  | { kind: "empty"; status: Status }
  // Every path that refuses to show a figure: the lab's own three `no_data` reasons, a stale forecast, an
  // implausible or malformed figure, and too few complete days. `reason` is the Polish explanation.
  | { kind: "unavailable"; status: Status; reason: string }
  | {
      kind: "forecast";
      // The verdict against the last real invoice — or, when the body covers another month, the mismatch.
      status: Status;
      monthLabel: string;
      isOtherMonth: boolean;
      // The headline: "od 155 zł do 360 zł". US-03 asks for a range rather than a single exact figure.
      rangeLabel: string;
      centralLabel: string;
      dayLabel: string;
      confidence: Status;
      // Set only when banked credit covers the whole month's import, which is why the figure is then just the
      // fixed fee; null otherwise.
      creditLeftLabel: string | null;
      basis: BillForecastBasis;
      closedMonthCheck: ClosedMonthCheckView | null;
    };

// Newest pushed bill forecast via the bill_forecast view; RLS returns nothing for non-owners. Errors are
// thrown so the page can show a load failure instead of pretending there is no forecast.
export async function loadBillForecast(client: SupabaseClient): Promise<BillForecastRow | null> {
  const { data, error } = await client
    .from("bill_forecast")
    .select("captured_at, received_at, bill_forecast")
    .limit(1)
    .overrideTypes<BillForecastRow[], { merge: false }>();
  if (error) throw new Error(`loading bill forecast failed: ${error.message}`);
  return data[0] ?? null;
}

const percent = new Intl.NumberFormat("pl-PL", { style: "percent", maximumFractionDigits: 0 });
// Rates are not estimates and are quoted to the grosz (and beyond, for the per-kWh rate), unlike the figures
// `plnLabel` rounds.
const exactZloty = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 });
const signedOneDecimal = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

function percentLabel(value: unknown): string {
  const ratio = asNumber(value);
  return ratio === null ? MISSING : percent.format(ratio);
}

// "−2,7%" with a real minus sign, as the usage card's deltas use.
function signedPercentLabel(value: unknown): string {
  const pct = asNumber(value);
  return pct === null ? MISSING : `${signedOneDecimal.format(pct).replace("-", "−")}%`;
}

// "1,0991 zł/kWh", or MISSING when there is no rate — a bare unit would say nothing.
function rateLabel(value: unknown, unit: string): string {
  const pln = asNumber(value);
  return pln === null ? MISSING : `${exactZloty.format(pln)} zł${unit}`;
}

// Month and day keys arrive in pushed jsonb, so they are checked before a formatter that would throw on them.
function monthLabel(value: unknown): string {
  return typeof value === "string" && MONTH_KEY.test(value) ? formatMonth(value) : MISSING;
}

// The lab publishes a settled period as the connector's text, "01.08.2026 - 31.08.2026" (the contract also still
// accepts "2026-08"). The month it names is the one the period ends in, as the lab's own lag calculation reads it.
const SETTLED_PERIOD = /^\d{2}\.(0[1-9]|1[0-2])\.\d{4} - \d{2}\.(0[1-9]|1[0-2])\.(\d{4})$/;

function periodMonthLabel(value: unknown): string {
  if (typeof value !== "string") return MISSING;
  const settled = SETTLED_PERIOD.exec(value);
  return settled ? monthLabel(`${settled[3]}-${settled[2]}`) : monthLabel(value);
}

function dayMonthLabel(value: unknown): string {
  return typeof value === "string" && DAY_KEY.test(value) ? formatDayMonth(value) : MISSING;
}

function dayCount(days: number): string {
  return `${String(days)} ${days === 1 ? "dzień" : "dni"}`;
}

function empty(label: string): BillForecastView {
  return { kind: "empty", status: { tone: "insufficient", label } };
}

function unavailable(tone: StatusTone, label: string, reason: string): BillForecastView {
  return { kind: "unavailable", status: { tone, label }, reason };
}

// The lab's own refusals. Each one says what the reader can expect next, in the words of someone who pays the
// bill — not what the pipeline is missing. The house rule: never explain the machinery, and where the body
// still carries an honest number, quote it instead of apologising.
const NO_DATA: Record<string, { tone: StatusTone; label: string; reason: string }> = {
  no_complete_days: {
    tone: "insufficient",
    label: "",
    reason: "Miesiąc dopiero się zaczął — kwota pojawi się po pierwszym pełnym dniu.",
  },
  settlement_facts_missing: {
    tone: "insufficient",
    label: "",
    reason:
      "PGE nie rozliczyło jeszcze poprzedniego miesiąca. Rachunek przychodzi zwykle około 3 tygodnie po jego końcu — wtedy wróci też prognoza.",
  },
  rates_unavailable: {
    tone: "problem",
    label: "brak ceny prądu",
    reason: "Nie znamy w tej chwili ceny prądu w Twojej taryfie, więc nie przeliczamy zużycia na złotówki.",
  },
};

// The owner's rule: the lab's own confidence, which it forces down to low whenever the reference month lags or
// the closed-month check misses badly (docs/logic.md).
const CONFIDENCE_STATUS: Record<Confidence, Status> = {
  low: { tone: "insufficient", label: "niska pewność" },
  medium: { tone: "watch", label: "średnia pewność" },
  high: { tone: "good", label: "wysoka pewność" },
};

function isConfidence(value: unknown): value is Confidence {
  return value === "low" || value === "medium" || value === "high";
}

// A lagging reference month is disclosed on the badge rather than hiding the figure: it is the normal state from
// the 1st of a month until roughly the 22nd, so hiding would leave the card blank for most of its life.
function confidenceStatus(value: unknown, referenceMonth: unknown, lagMonths: number): Status {
  const base = isConfidence(value) ? CONFIDENCE_STATUS[value] : { tone: "insufficient" as StatusTone, label: "" };
  if (lagMonths <= 0) return { ...base };
  const month = periodMonthLabel(referenceMonth);
  const detail = `rozliczenie za ${month}, nie za ostatni miesiąc`;
  return { tone: base.tone, label: base.label ? `${base.label} — ${detail}` : detail };
}

// The central figure against the last real invoice. Exactly on a line takes the milder status (docs/logic.md).
// Without an invoice there is no comparison at all: falling back to the lab's own `computed_gross_pln` would
// quietly change the colour's meaning from "against your last bill" to "against our own arithmetic".
function verdictStatus(central: number, invoice: number | null): Status {
  if (invoice === null) {
    return { tone: "insufficient", label: "brak zamkniętego rachunku do porównania" };
  }
  const reference = plnLabel(invoice);
  if (central <= invoice + EPSILON) {
    return { tone: "good", label: `nie więcej niż ostatni rachunek (${reference})` };
  }
  const band = `${String(Math.round((BILL_AMBER_RATIO - 1) * 100))}%`;
  if (central <= invoice * BILL_AMBER_RATIO + EPSILON) {
    return { tone: "watch", label: `do ${band} powyżej ostatniego rachunku (${reference})` };
  }
  return { tone: "problem", label: `ponad ${band} powyżej ostatniego rachunku (${reference})` };
}

// The complete days the estimate rests on (FR-018). `formatPeriod` throws on an empty list, so a body without
// usable dates falls back to the bare count the lab reported.
function dayLabelOf(observedDays: unknown, completedDays: number, now: Date): string {
  const dates = Array.isArray(observedDays)
    ? observedDays.map((day) => asRecord(day).date).filter((date): date is string => typeof date === "string")
    : [];
  if (dates.length === 0) return dayCount(completedDays);
  return formatPeriod(dates, warsawParts(now).dayKey.slice(0, 4)).label;
}

// The refusal checks run in a fixed order, because a later one reads a key an earlier one proves absent: a
// `no_data` body carries almost nothing, and a stale or implausible body must not reach the day count.
export function toBillForecastView(row: BillForecastRow | null, now: Date): BillForecastView {
  if (!row) return empty("laboratorium jeszcze nie przesłało prognozy");

  const body = asRecord(row.bill_forecast);

  // 1. The lab refused to produce a figure and said why.
  if (body.status === "no_data") {
    const refusal = typeof body.reason === "string" ? NO_DATA[body.reason] : undefined;
    if (refusal) return unavailable(refusal.tone, refusal.label, refusal.reason);
    return unavailable(
      "insufficient",
      "",
      "Nie znamy w tej chwili kwoty za ten miesiąc. Wróci przy kolejnym przeliczeniu.",
    );
  }
  if (body.status !== "ok") {
    return unavailable(
      "problem",
      "nierozpoznane wyliczenie",
      "Nie rozpoznajemy ostatniego wyliczenia, więc kwoty nie pokazujemy.",
    );
  }

  // 2. Freshness, against the forecast's own clock.
  const generatedAt = typeof body.generated_at === "string" ? Date.parse(body.generated_at) : NaN;
  if (Number.isNaN(generatedAt)) {
    return unavailable(
      "problem",
      "nieznany czas wyliczenia",
      "Nie wiadomo, kiedy powstało ostatnie wyliczenie, więc kwoty nie pokazujemy.",
    );
  }
  const ageMs = now.getTime() - generatedAt;
  if (ageMs < -FORECAST_FUTURE_SKEW_MS) {
    return unavailable(
      "problem",
      "czas wyliczenia z przyszłości",
      "Ostatnie wyliczenie ma czas z przyszłości, więc nie wiadomo, czy jest aktualne, i kwoty nie pokazujemy.",
    );
  }
  if (ageMs > FORECAST_STALE_AFTER_MS) {
    return unavailable(
      "problem",
      `wyliczona ${formatAge(ageMs)} temu`,
      `Ostatnie wyliczenie ma już ${formatAge(ageMs)} — kwota z niego byłaby nieaktualna.`,
    );
  }

  // 3. Plausibility. Shape and sign are the contract's job; these three guards are deliberately not in zod,
  // because a 422 would reject the whole push and stop the live state and the recommendation with it.
  const central = asNumber(body.projected_bill_gross_pln);
  const range = asRecord(body.range_gross_pln);
  const low = asNumber(range.low);
  const high = asNumber(range.high);
  if (central === null || low === null || high === null) {
    return unavailable(
      "problem",
      "kwoty nie da się odczytać",
      "Ostatnie wyliczenie nie zawiera czytelnej kwoty, więc nie ma czego pokazać.",
    );
  }
  if (low > high) {
    return unavailable(
      "problem",
      "sprzeczne dane",
      "Dane z ostatniego wyliczenia są sprzeczne — dolna kwota wyszła wyżej niż górna — więc kwoty nie pokazujemy.",
    );
  }
  if (central < low || central > high) {
    return unavailable(
      "problem",
      "sprzeczne dane",
      "Dane z ostatniego wyliczenia są sprzeczne — najbardziej prawdopodobna kwota leży poza swoim przedziałem — więc kwoty nie pokazujemy.",
    );
  }
  if (Math.max(central, low, high) > MAX_PLAUSIBLE_BILL_PLN) {
    return unavailable(
      "problem",
      "nierealna kwota",
      `Wyliczona kwota (ponad ${plnLabel(MAX_PLAUSIBLE_BILL_PLN)}) jest przy tym domu nierealna — to błąd danych, nie Twój rachunek.`,
    );
  }
  const settlement = asRecord(body.settlement);
  const signGuarded = [settlement.reference_consumed_kwh, settlement.reference_feed_in_kwh, settlement.export_ratio];
  if (signGuarded.some((value) => (asNumber(value) ?? 0) < 0)) {
    return unavailable(
      "problem",
      "błędne dane z PGE",
      "Dane rozliczeniowe z PGE wyglądają na błędne, więc kwoty nie pokazujemy.",
    );
  }

  // 4. Too little of the month behind the figure: the grey "za mało danych" state. The body is fresh and its
  // figures passed every guard above — it is only early — so the reader's own daily usage is quoted rather than
  // leaving them with a blank card. The corrupt and stale paths above deliberately quote nothing: a body this
  // card has just declared untrustworthy has no number worth repeating.
  const completedDays = asNumber(body.completed_days_used) ?? 0;
  if (completedDays < MIN_COMPLETE_DAYS) {
    const averageDaily = asNumber(body.average_daily_import_kwh);
    const usage = averageDaily === null ? "" : ` Na razie zużywasz średnio ${kwhLabel(averageDaily)} dziennie.`;
    return unavailable(
      "insufficient",
      "",
      `Za mało dni, żeby przewidzieć rachunek — jest ${dayCount(completedDays)} z ${String(MIN_COMPLETE_DAYS)} potrzebnych.${usage}`,
    );
  }

  const check = "closed_month_check" in body ? asRecord(body.closed_month_check) : null;
  const invoice = check === null ? null : asNumber(check.invoice_gross_pln);
  // A forecast generated at 23:58 on the last day of a month and read at 00:05 the next is still fresh, but it
  // describes the month before. The repo's rule for wrong-period data is relabel-and-keep-showing (as the
  // recommendation card does for advice from an earlier day), never withholding.
  const isOtherMonth = typeof body.month === "string" && body.month !== warsawMonthKey(now);
  const pricing = asRecord(body.pricing);
  const lagMonths = asNumber(settlement.reference_lag_months) ?? 0;
  const creditLeft = asNumber(body.credit_left_kwh) ?? 0;

  return {
    kind: "forecast",
    status: isOtherMonth
      ? { tone: "problem", label: `to prognoza za ${monthLabel(body.month)}, nie za bieżący miesiąc` }
      : verdictStatus(central, invoice),
    monthLabel: monthLabel(body.month),
    isOtherMonth,
    rangeLabel: `od ${plnLabel(low)} do ${plnLabel(high)}`,
    centralLabel: `ok. ${plnLabel(central)}`,
    dayLabel: dayLabelOf(body.observed_days, completedDays, now),
    confidence: confidenceStatus(body.confidence, settlement.reference_period, lagMonths),
    creditLeftLabel: creditLeft > 0 ? kwhLabel(creditLeft) : null,
    basis: {
      referenceMonthLabel: periodMonthLabel(settlement.reference_period),
      referenceLagMonths: lagMonths,
      exportRatioLabel: percentLabel(settlement.export_ratio),
      rateLabel: rateLabel(pricing.variable_gross_pln_per_kwh, "/kWh"),
      fixedFeeLabel: rateLabel(pricing.fixed_gross_pln_per_month, " / mies."),
      ratesVerifiedOnLabel: dayMonthLabel(pricing.rates_verified_on),
    },
    closedMonthCheck:
      check === null
        ? null
        : {
            monthLabel: periodMonthLabel(check.period),
            computedLabel: plnLabel(check.computed_gross_pln),
            invoiceLabel: plnLabel(check.invoice_gross_pln),
            diffLabel: signedPercentLabel(check.diff_pct),
            ok: check.ok === true,
          },
  };
}
