import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillForecastRow } from "@/types";
import { edgePercentLabel } from "@/lib/format/edge-percent";
import { formatPeriod } from "@/lib/format/period";
import type { Status, StatusTone } from "@/lib/format/status";
import { asNumber, asRecord, kwhLabel, MISSING, plnLabel } from "@/lib/format/values";
import { formatDayMonth, formatMonth, warsawMonthKey, warsawParts } from "@/lib/format/warsaw-time";
import { formatAge } from "@/lib/services/live-state";
import { queryError } from "@/lib/query-error";

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
// showing a figure (context/archive/2026-09-27-bill-forecast/change.md:14).
export const MIN_COMPLETE_DAYS = 7;
// The lab drops a day reading above 200 kWh as a counter glitch (docs/logic.md), so the most expensive month it
// can honestly report is 200 × 31 × 1.0991 + 44.62 ≈ 6859 PLN. Anything above this is a publisher bug — a
// negative `feed_in_kwh` once produced a 41M-PLN range end — so it blanks this card rather than 422ing the whole
// push, which would stop the live state and the recommendation too.
export const MAX_PLAUSIBLE_BILL_PLN = 7000;
// The verdict bands against the last real invoice: at or below it is good, up to +20% is worth watching, above
// is a problem (context/archive/2026-09-27-bill-forecast/change.md:14).
export const BILL_AMBER_RATIO = 1.2;
// The same line in whole percent.
const BILL_AMBER_PERCENT = Math.round((BILL_AMBER_RATIO - 1) * 100);
// The contract's cap on `observed_days` (one entry per day of the longest month). The mapper applies it itself so
// a body that skipped validation cannot make the day label or the count unbounded.
export const MAX_OBSERVED_DAYS = 31;
// A reference month this many months behind is already as stale as the card can say; the sentence "o N mies."
// stops there rather than printing whatever the lab sent.
export const MAX_SHOWN_LAG_MONTHS = 12;
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
      // The central figure against the invoice the verdict uses; null where no honest comparison exists (no
      // invoice, another month, or an invoice month that cannot be read).
      delta: BillDeltaView | null;
      // How much of the month the estimate rests on; null when the body is inconsistent.
      days: BillDaysView | null;
    };

export interface BillDeltaView {
  text: string;
  tone: "good" | "watch" | "problem";
  direction: "up" | "down" | "flat";
}

// `label` is "15 z 30", `share` 0 to 1.
export interface BillDaysView {
  used: number;
  inMonth: number;
  label: string;
  share: number;
}

// Newest pushed bill forecast via the bill_forecast view; RLS returns nothing for non-owners. Errors are
// thrown so the page can show a load failure instead of pretending there is no forecast.
export async function loadBillForecast(client: SupabaseClient): Promise<BillForecastRow | null> {
  const { data, error } = await client
    .from("bill_forecast")
    .select("captured_at, received_at, bill_forecast")
    .limit(1)
    .overrideTypes<BillForecastRow[], { merge: false }>();
  if (error) throw queryError("loading bill forecast failed", error);
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
  // Without a readable reference month the lag is still on the "Na podstawie" sentence, so the badge omits the
  // detail rather than naming "—".
  if (month === MISSING) return { ...base };
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
  const band = `${String(BILL_AMBER_PERCENT)}%`;
  switch (verdictTone(central, invoice)) {
    case "good":
      return { tone: "good", label: `nie więcej niż ostatni rachunek (${reference})` };
    case "watch":
      return { tone: "watch", label: `do ${band} powyżej ostatniego rachunku (${reference})` };
    case "problem":
      return { tone: "problem", label: `ponad ${band} powyżej ostatniego rachunku (${reference})` };
  }
}

// The tone of the central figure against a real invoice, shared by the badge and the delta line so they can never
// disagree.
export type VerdictTone = "good" | "watch" | "problem";

export function verdictTone(central: number, invoice: number): VerdictTone {
  // "Not more than the last invoice" is judged on the whole-złoty amounts the card shows, so 214.90 against
  // 214.66 does not read as "above" 215 zł with 215 zł on both sides. The +20% line is not displayed as an amount
  // and stays exact.
  if (Math.round(central) <= Math.round(invoice) || central <= invoice + EPSILON) return "good";
  if (central <= invoice * BILL_AMBER_RATIO + EPSILON) return "watch";
  return "problem";
}

// "+43 zł (+20,1%) względem ostatniego rachunku za sierpień 2026", or "bez zmian względem…" on a zero difference.
// Only where the comparison is honest: the caller passes a real invoice and its readable month.
function billDelta(central: number, invoice: number, invoiceMonth: string): BillDeltaView {
  const tone = verdictTone(central, invoice);
  const amount = Math.round(central) - Math.round(invoice);
  const against = `względem ostatniego rachunku za ${invoiceMonth}`;
  if (amount === 0) return { text: `bez zmian ${against}`, tone, direction: "flat" };

  let percentText = "";
  if (Math.round(invoice) !== 0) {
    const raw = (central / invoice - 1) * 100;
    // Round half away from zero, symmetric for increases and decreases.
    const whole = Math.sign(raw) * Math.round(Math.abs(raw) + EPSILON);
    if (whole !== 0) {
      // On the +20% verdict line a whole percent could read "+20%" next to either status (the same rule as the
      // usage card's ±15%), so the whole 19,5 to 20,5% band is shown with one decimal, decided like the tone.
      percentText =
        amount > 0 && whole === BILL_AMBER_PERCENT
          ? edgePercentLabel(raw, BILL_AMBER_PERCENT, tone !== "problem")
          : `${whole > 0 ? "+" : "−"}${String(Math.abs(whole))}%`;
    }
  }
  const sign = amount > 0 ? "+" : "−";
  const figures = `${sign}${plnLabel(Math.abs(amount))}${percentText ? ` (${percentText})` : ""}`;
  return { text: `${figures} ${against}`, tone, direction: amount > 0 ? "up" : "down" };
}

// The share of the forecast month's days the estimate rests on. Its own month key, else the Warsaw month now;
// null when the body claims more complete days than the month has.
function billDays(monthKey: unknown, used: number, now: Date): BillDaysView | null {
  const key = typeof monthKey === "string" && MONTH_KEY.test(monthKey) ? monthKey : warsawMonthKey(now);
  const [year, month] = key.split("-").map(Number);
  const inMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (used > inMonth) return null;
  return { used, inMonth, label: `${String(used)} z ${String(inMonth)}`, share: used / inMonth };
}

// The complete days the estimate rests on (FR-018). `formatPeriod` throws on an empty list, so a body without
// usable dates falls back to the bare count the lab reported.
function dayLabelOf(observedDays: unknown[] | null, completedDays: number, now: Date): string {
  const dates = (observedDays ?? [])
    .map((day) => asRecord(day).date)
    .filter((date): date is string => typeof date === "string" && DAY_KEY.test(date));
  if (dates.length === 0) return dayCount(completedDays);
  return formatPeriod(dates, warsawParts(now).dayKey.slice(0, 4)).label;
}

// The refusal checks run in a fixed order, because a later one reads a key an earlier one proves absent: a
// `no_data` body carries almost nothing, and a stale or implausible body must not reach the day count.
export function toBillForecastView(row: BillForecastRow | null, now: Date): BillForecastView {
  if (!row) return empty("laboratorium jeszcze nie przesłało prognozy");

  const body = asRecord(row.bill_forecast);

  // 1. A body of neither known status is not read at all.
  if (body.status !== "ok" && body.status !== "no_data") {
    return unavailable(
      "problem",
      "nierozpoznane wyliczenie",
      "Nie rozpoznajemy ostatniego wyliczenia, więc kwoty nie pokazujemy.",
    );
  }

  // 2. Freshness, against the forecast's own clock, for both statuses: a `no_data` body carries `generated_at`
  // too, and a last "the month has only just begun" kept for weeks would otherwise never look stale.
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

  // The lab refused to produce a figure and said why. `hasOwn`, because the reason is pushed text and a plain
  // object also answers to "constructor".
  if (body.status === "no_data") {
    const refusal =
      typeof body.reason === "string" && Object.hasOwn(NO_DATA, body.reason) ? NO_DATA[body.reason] : null;
    if (refusal) return unavailable(refusal.tone, refusal.label, refusal.reason);
    return unavailable(
      "insufficient",
      "",
      "Nie znamy w tej chwili kwoty za ten miesiąc. Wróci przy kolejnym przeliczeniu.",
    );
  }

  // 3. Plausibility. Shape and the sign of money are the contract's job; these guards are deliberately not in zod,
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
  // The closed-month check is read here because both the sign guard and the ceiling below judge its amounts: present
  // but not an object (null, a string) is as good as absent, and an amount that is absent or not a number is skipped.
  const rawCheck = body.closed_month_check;
  const check = rawCheck && typeof rawCheck === "object" && !Array.isArray(rawCheck) ? asRecord(rawCheck) : null;
  const closedMonthAmounts = (
    check === null ? [] : [asNumber(check.computed_gross_pln), asNumber(check.invoice_gross_pln)]
  ).filter((amount) => amount !== null);
  // The contract already rejects a negative central, low, high or closed-month amount with a 422, so this only
  // protects a stored row that skipped validation; the view model does not trust stored jsonb.
  if ([central, low, high, ...closedMonthAmounts].some((amount) => amount < 0)) {
    return unavailable("problem", "ujemna kwota", "Wyliczona kwota jest ujemna, więc jej nie pokazujemy.");
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
  // The contract has no ceiling on the closed-month amounts either, and an inflated invoice would flip the verdict to
  // good, so they share the ceiling when readable.
  if (Math.max(central, low, high, ...closedMonthAmounts) > MAX_PLAUSIBLE_BILL_PLN * 1000) {
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
  // The derived kWh figures are signed by the contract's silence, not by its types (a negative feed-in makes a
  // negative credit), so their sign is judged here.
  const derivedKwh = [
    body.projected_import_kwh,
    body.projected_credit_kwh,
    body.projected_billable_kwh,
    body.credit_left_kwh,
  ];
  if (derivedKwh.some((value) => typeof value === "number" && (!Number.isFinite(value) || value < 0))) {
    return unavailable(
      "problem",
      "błędne dane w wyliczeniu",
      "Wyliczenie zawiera ujemne lub nieczytelne ilości energii, więc kwoty nie pokazujemy.",
    );
  }

  // 4. Too little of the month behind the figure: the grey "za mało danych" state. The body is fresh and its
  // figures passed every guard above — it is only early — so the reader's own daily usage is quoted rather than
  // leaving them with a blank card. The corrupt and stale paths above deliberately quote nothing: a body this
  // card has just declared untrustworthy has no number worth repeating.
  // The count comes from the days themselves: `completed_days_used` is a second claim about the same thing, and
  // trusting it alone let 20 "complete days" pass the gate on 3 observed ones. Only a body without a day list
  // falls back to the lab's own count.
  const observedDays = Array.isArray(body.observed_days)
    ? (body.observed_days as unknown[]).slice(0, MAX_OBSERVED_DAYS)
    : null;
  const completedDays = observedDays ? observedDays.length : (asNumber(body.completed_days_used) ?? 0);
  if (completedDays < MIN_COMPLETE_DAYS) {
    const averageDaily = asNumber(body.average_daily_import_kwh);
    const usage = averageDaily === null ? "" : ` Na razie zużywasz średnio ${kwhLabel(averageDaily)} dziennie.`;
    return unavailable(
      "insufficient",
      "",
      `Za mało dni, żeby przewidzieć rachunek — jest ${dayCount(completedDays)} z ${String(MIN_COMPLETE_DAYS)} potrzebnych.${usage}`,
    );
  }

  // `check` was read with the sign guard above.
  const invoice = check === null ? null : asNumber(check.invoice_gross_pln);
  // The delta names the invoice's own month (the closed-month check's period), not the settlement's reference.
  const invoiceMonth = check === null ? MISSING : periodMonthLabel(check.period);
  // A forecast generated at 23:58 on the last day of a month and read at 00:05 the next is still fresh, but it
  // describes the month before. The repo's rule for wrong-period data is relabel-and-keep-showing (as the
  // recommendation card does for advice from an earlier day), never withholding.
  const isOtherMonth = typeof body.month === "string" && body.month !== warsawMonthKey(now);
  const pricing = asRecord(body.pricing);
  const lagMonths = Math.min(asNumber(settlement.reference_lag_months) ?? 0, MAX_SHOWN_LAG_MONTHS);
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
    dayLabel: dayLabelOf(observedDays, completedDays, now),
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
    delta:
      invoiceMonth === MISSING || invoice === null || isOtherMonth ? null : billDelta(central, invoice, invoiceMonth),
    days: billDays(body.month, completedDays, now),
  };
}
