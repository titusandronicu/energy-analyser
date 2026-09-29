import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyEnergyRow, LiveStateRow } from "@/types";
import { asNumber, asRecord, kwhLabel, MISSING, oneDecimal } from "@/lib/format/values";
import { TONE_WORD } from "@/lib/format/status";
import type { Status, StatusTone } from "@/lib/format/status";
import { formatDayMonth, warsawParts } from "@/lib/format/warsaw-time";
import { dailyLoadNorm, deltaLabel, FAR_ABOVE_THRESHOLD, STATUS_THRESHOLD } from "@/lib/services/usage-insight";

// The lab pushes every few minutes; a snapshot older than 15 minutes no longer describes "now".
export const LIVE_STALE_AFTER_MS = 15 * 60 * 1000;
// After two hours without a snapshot the lab has most likely stopped pushing: a problem, not just old data.
export const LIVE_PROBLEM_AFTER_MS = 2 * 60 * 60 * 1000;
// Below this a flow is noise (inverter idle draw, meter jitter): it shows as "0,0 kW" with no direction word.
export const MIN_FLOW_W = 50;
// Battery charge-level bands for the flow diagram's icon (live-state-flow-visual): purely which icon shows,
// never a displayed number or verdict. Exactly on a line takes the higher (milder) level.
export const BATTERY_FULL_AT = 80;
export const BATTERY_LOW_AT = 30;
export const BATTERY_WARNING_AT = 10;
// Battery verdict lines (live-flow-interaction): at or above GOOD_AT is good, from PROBLEM_BELOW up to but
// excluding GOOD_AT is worth watching, under PROBLEM_BELOW is a problem. Exactly on a line takes the milder status.
export const BATTERY_GOOD_AT = BATTERY_LOW_AT;
export const BATTERY_PROBLEM_BELOW = BATTERY_WARNING_AT;
// PV verdict (live-flow-interaction): today's kWh so far against the day's forecast times the share expected by the
// capture time. Rated only from PV_RATE_FROM_HOUR (Warsaw); a share at or above PV_GOOD_AT is good, from PV_WATCH_AT up
// to but excluding PV_GOOD_AT worth watching, under PV_WATCH_AT a problem. Exactly on a line takes the milder status.
export const PV_RATE_FROM_HOUR = 15;
export const PV_GOOD_AT = 0.85;
export const PV_WATCH_AT = 0.6;
// Per calendar month (index 0 = January): [share of the day's PV expected by 15:00, hour the day's PV is done].
// ESTIMATED from clear-sky solar geometry (52.2 N 21.0 E, flat array, mid-month), not measured: revisit after a
// year of lab data.
export const PV_EXPECTED_SHARE: readonly (readonly [number, number])[] = [
  [0.98, 15.3],
  [0.92, 16.1],
  [0.89, 16.8],
  [0.76, 18.5],
  [0.75, 19.2],
  [0.73, 19.7],
  [0.73, 19.6],
  [0.75, 18.9],
  [0.8, 17.9],
  [0.86, 16.9],
  [0.99, 15.1],
  [1.0, 14.8],
];
// Consumption verdict: today's kWh against the daily norm pro-rated by the hours elapsed; rated from this hour.
// The bands reuse the usage card's STATUS_THRESHOLD (good up to +15%, lower is never bad) and FAR_ABOVE_THRESHOLD
// (problem above +40%).
export const LOAD_RATE_FROM_HOUR = 6;
// The lab pushes every 5 minutes, so today's daily row captured more than a stale window before the snapshot came
// from an earlier push (daily history is optional in a push); its consumption total is then not rated.
export const DAILY_ROW_MAX_LAG_MS = LIVE_STALE_AFTER_MS;
// Absorbs floating point error so an exact line stays on the milder side.
const EPSILON = 1e-9;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type BatteryChargeLevel = "full" | "medium" | "low" | "warning";

export interface FlowLabel {
  value: string;
  direction: string | null;
  watts: number | null;
}

// `word` is lower case like TONE_WORD ("dobrze", "bez oceny"); the view capitalises it when it starts a sentence.
export interface NodeVerdict {
  tone: StatusTone;
  word: string;
  detail: string;
  explanation: string;
}

export interface FlowMotion {
  watts: number | null;
  moving: boolean;
}

export type LiveStateView =
  | { kind: "empty"; status: Status }
  | {
      kind: "state";
      status: Status;
      capturedAtLabel: string;
      ageLabel: string;
      isStale: boolean;
      isDegraded: boolean;
      pv: string;
      homeLoad: string;
      grid: FlowLabel;
      battery: FlowLabel & { socLabel: string; socPct: number | null; chargeLevel: BatteryChargeLevel | null };
      today: { pv: string; bought: string; sold: string; periodLabel: string };
      flows: { pv: FlowMotion; home: FlowMotion; grid: FlowMotion; battery: FlowMotion };
      verdicts: { battery: NodeVerdict; pv: NodeVerdict; home: NodeVerdict };
    };

// Newest homelab snapshot via the live_state view; RLS returns nothing for non-owners. Errors are thrown
// so the page can show a load failure instead of pretending there is no data.
export async function loadLiveState(client: SupabaseClient): Promise<LiveStateRow | null> {
  const { data, error } = await client
    .from("live_state")
    .select("captured_at, received_at, state")
    .limit(1)
    .overrideTypes<LiveStateRow[], { merge: false }>();
  if (error) throw new Error(`loading live state failed: ${error.message}`);
  return data[0] ?? null;
}

// When the daily row for `dayKey` was captured; readable by owners through a column grant. Errors are thrown
// (for example the grant not applied yet); the page isolates them so the consumption verdict is only unrated.
export async function loadDailyRowCapturedAt(client: SupabaseClient, dayKey: string): Promise<string | null> {
  const { data, error } = await client
    .from("daily_energy")
    .select("captured_at")
    .eq("day", dayKey)
    .limit(1)
    .overrideTypes<{ captured_at: string }[], { merge: false }>();
  if (error) throw new Error(`loading daily row time failed: ${error.message}`);
  return data[0]?.captured_at ?? null;
}

const wholeNumber = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 });

function kwLabel(watts: number | null): string {
  return watts === null ? MISSING : `${oneDecimal.format(Math.abs(watts) / 1000)} kW`;
}

// Sign conventions follow the ingest contract: the value is shown unsigned and the sign becomes a direction.
function flow(value: unknown, positive: string, negative: string): FlowLabel {
  const watts = asNumber(value);
  const direction = watts === null || Math.abs(watts) < MIN_FLOW_W ? null : watts > 0 ? positive : negative;
  return { value: kwLabel(watts), direction, watts };
}

// Which icon the flow diagram shows for the battery; null exactly when the percentage itself is unknown.
function chargeLevelOf(socPct: number | null): BatteryChargeLevel | null {
  if (socPct === null) return null;
  if (socPct >= BATTERY_FULL_AT) return "full";
  if (socPct >= BATTERY_LOW_AT) return "medium";
  if (socPct >= BATTERY_WARNING_AT) return "low";
  return "warning";
}

// One rule for "is this flow moving": fresh data and at least MIN_FLOW_W in either direction.
function motion(watts: number | null, isStale: boolean): FlowMotion {
  return { watts, moving: !isStale && watts !== null && Math.abs(watts) >= MIN_FLOW_W };
}

const UNRATED_WORD = "bez oceny";

function verdict(tone: StatusTone, detail: string, explanation: string): NodeVerdict {
  return { tone, word: tone === "insufficient" ? UNRATED_WORD : TONE_WORD[tone], detail, explanation };
}

const BATTERY_RULE = `od ${String(BATTERY_GOOD_AT)}% w górę to dobrze, ${String(BATTERY_PROBLEM_BELOW)}–${String(BATTERY_GOOD_AT)}% warto sprawdzić, poniżej ${String(BATTERY_PROBLEM_BELOW)}% problem. 100% nigdy nie jest złe.`;

// The battery is rated on its charge level alone; a missing reading or an old snapshot is never rated.
function batteryVerdict(socPct: number | null, socLabel: string, isStale: boolean): NodeVerdict {
  if (isStale) {
    return verdict(
      "insufficient",
      "dane nieaktualne",
      "Migawka jest nieaktualna, więc poziom naładowania nie jest oceniany.",
    );
  }
  if (socPct === null) {
    return verdict("insufficient", "brak odczytu", "Brak odczytu poziomu naładowania, więc bateria nie jest oceniana.");
  }
  const rule = `Poziom naładowania ${socLabel}: ${BATTERY_RULE}`;
  if (socPct >= BATTERY_GOOD_AT) {
    return verdict("good", socPct >= BATTERY_FULL_AT ? "wysoki poziom" : "w normie", rule);
  }
  if (socPct >= BATTERY_PROBLEM_BELOW) return verdict("watch", "niski poziom", rule);
  return verdict("problem", "prawie pusta", rule);
}

// Share of the day's PV expected by `decimalHour` (Warsaw) in `month` (1-12): the 15:00 share, rising linearly to
// 1.0 at the done hour and 1.0 afterwards; null before PV_RATE_FROM_HOUR, when nothing is rated.
export function expectedPvShare(month: number, decimalHour: number): number | null {
  if (decimalHour < PV_RATE_FROM_HOUR) return null;
  const [shareAtStart, doneHour] = PV_EXPECTED_SHARE[month - 1];
  if (doneHour <= PV_RATE_FROM_HOUR || decimalHour >= doneHour) return 1;
  return shareAtStart + ((1 - shareAtStart) * (decimalHour - PV_RATE_FROM_HOUR)) / (doneHour - PV_RATE_FROM_HOUR);
}

function unrated(detail: string, explanation: string): NodeVerdict {
  return verdict("insufficient", detail, explanation);
}

const STALE_VERDICT = unrated("dane nieaktualne", "Migawka jest nieaktualna, więc ten odczyt nie jest oceniany.");
const NO_HISTORY_DETAIL = "brak danych historii";

// "94%"; at a line (85%, 60%) one decimal so the number never reads as the line while the badge says the other side
// of it (84,9% is watch, 85,0% is good), as deltaLabel does for the consumption bands.
function shareLabel(share: number): string {
  const percent = share * 100;
  const whole = Math.round(percent + EPSILON);
  const line = [PV_GOOD_AT, PV_WATCH_AT].find((l) => whole === Math.round(l * 100));
  if (line === undefined) return `${wholeNumber.format(whole)}%`;
  const edge = line * 100;
  const tenths = Math.round(percent * 10 + EPSILON) / 10;
  const atOrAbove = share >= line - EPSILON;
  return `${oneDecimal.format(atOrAbove ? Math.max(tenths, edge) : Math.min(tenths, edge - 0.1))}%`;
}

function pvVerdict(
  captured: { hour: number; month: number; time: string; dayKey: string },
  pvTodayKwh: number | null,
  dailyRows: DailyEnergyRow[],
  isStale: boolean,
): NodeVerdict {
  if (isStale) return STALE_VERDICT;
  const expected = expectedPvShare(captured.month, captured.hour);
  if (expected === null) {
    return unrated(
      "za wcześnie",
      `Produkcja PV jest oceniana od ${String(PV_RATE_FROM_HOUR)}:00, gdy większość dziennej produkcji jest już za nami.`,
    );
  }
  if (dailyRows.length === 0) {
    return unrated(NO_HISTORY_DETAIL, "Brak danych historii, więc nie ma prognozy na dziś do porównania.");
  }
  const forecast = asNumber(dailyRows.find((day) => day.day === captured.dayKey)?.pv_forecast_kwh);
  if (forecast === null || forecast <= 0) {
    return unrated("brak prognozy", "Brak prognozy produkcji na dziś, więc produkcja PV nie jest oceniana.");
  }
  if (pvTodayKwh === null) {
    return unrated("brak odczytu", "Brak odczytu dzisiejszej produkcji, więc produkcja PV nie jest oceniana.");
  }
  const expectedKwh = forecast * expected;
  const share = pvTodayKwh / expectedKwh;
  const shown = shareLabel(share);
  const rule = `od ${String(Math.round(PV_GOOD_AT * 100))}% dobrze, ${String(Math.round(PV_WATCH_AT * 100))}–${String(Math.round(PV_GOOD_AT * 100))}% warto sprawdzić, poniżej ${String(Math.round(PV_WATCH_AT * 100))}% problem.`;
  const explanation = `Do ${captured.time} wyprodukowano ${kwhLabel(pvTodayKwh)}, a wg prognozy na dziś (${kwhLabel(forecast)}) do tej pory powinno być ok. ${kwhLabel(expectedKwh)}, czyli ${shown} oczekiwanego: ${rule}`;
  const detail = `${shown} prognozy`;
  if (share >= PV_GOOD_AT - EPSILON) return verdict("good", detail, explanation);
  if (share >= PV_WATCH_AT - EPSILON) return verdict("watch", detail, explanation);
  return verdict("problem", detail, explanation);
}

function homeVerdict(
  captured: { hour: number; time: string; dayKey: string },
  capturedAtMs: number,
  dailyRows: DailyEnergyRow[],
  todayRowCapturedAt: string | null | undefined,
  now: Date,
  isStale: boolean,
): NodeVerdict {
  if (isStale) return STALE_VERDICT;
  if (captured.hour < LOAD_RATE_FROM_HOUR) {
    return unrated(
      "za wcześnie",
      `Zużycie domu jest oceniane od ${String(LOAD_RATE_FROM_HOUR).padStart(2, "0")}:00, gdy dzienne zużycie ma już z czym się porównać.`,
    );
  }
  if (dailyRows.length === 0) {
    return unrated(NO_HISTORY_DETAIL, "Brak danych historii, więc nie ma normy zużycia do porównania.");
  }
  // The daily row is written independently of the snapshot: a fresh state-only push leaves an older total in place,
  // which must not be read as consumption up to this snapshot's capture time.
  const rowMs = todayRowCapturedAt == null ? Number.NaN : Date.parse(todayRowCapturedAt);
  if (Number.isNaN(rowMs)) {
    return unrated(
      "brak czasu historii",
      "Nie wiadomo, z kiedy pochodzi dzisiejsze zużycie w historii, więc zużycie domu nie jest oceniane.",
    );
  }
  if (capturedAtMs - rowMs > DAILY_ROW_MAX_LAG_MS) {
    return unrated(
      "historia nieaktualna",
      "Dzisiejsze zużycie w historii pochodzi z wcześniejszego odczytu niż ta migawka, więc zużycie domu nie jest oceniane.",
    );
  }
  const load = asNumber(dailyRows.find((day) => day.day === captured.dayKey)?.load_kwh);
  if (load === null) {
    return unrated("brak odczytu", "Brak dzisiejszego zużycia, więc zużycie domu nie jest oceniane.");
  }
  const loadNorm = dailyLoadNorm(dailyRows, now);
  if (loadNorm?.norm == null || loadNorm.norm <= 0) {
    return unrated(
      "za mało danych",
      "Za mało dni z historii, by wyznaczyć normę zużycia, więc zużycie domu nie jest oceniane.",
    );
  }
  const expectedKwh = (loadNorm.norm * captured.hour) / 24;
  const shown = deltaLabel(load, expectedKwh);
  const detail = `${shown} wobec normy`;
  const line = String(Math.round(STATUS_THRESHOLD * 100));
  const far = String(Math.round(FAR_ABOVE_THRESHOLD * 100));
  const explanation = `Do ${captured.time} zużyto ${kwhLabel(load)}, a norma dla tej pory dnia to ok. ${kwhLabel(expectedKwh)} (dzienna ${kwhLabel(loadNorm.norm)} proporcjonalnie do godziny), czyli ${shown} wobec normy: do +${line}% dobrze, od +${line}% do +${far}% warto sprawdzić, powyżej +${far}% problem. Mniejsze zużycie nigdy nie jest złe.`;
  const ratio = load / expectedKwh;
  if (ratio > 1 + FAR_ABOVE_THRESHOLD + EPSILON) return verdict("problem", detail, explanation);
  if (ratio > 1 + STATUS_THRESHOLD + EPSILON) return verdict("watch", detail, explanation);
  return verdict("good", detail, explanation);
}

// "5 min" under an hour, "2 godz." under a day, "3 dni" beyond. A capture time in the future counts as 0.
export function formatAge(ageMs: number): string {
  const age = Math.max(0, ageMs);
  if (age < HOUR_MS) return `${String(Math.floor(age / MINUTE_MS))} min`;
  if (age < DAY_MS) return `${String(Math.floor(age / HOUR_MS))} godz.`;
  const days = Math.floor(age / DAY_MS);
  return days === 1 ? "1 dzień" : `${String(days)} dni`;
}

// Staleness wins over degraded: an old snapshot says nothing about the source's health now. Exactly at a line is
// the milder status.
function liveStatus(ageMs: number, isDegraded: boolean): Status {
  if (ageMs > LIVE_PROBLEM_AFTER_MS) return { tone: "problem", label: `brak nowych danych od ${formatAge(ageMs)}` };
  if (ageMs > LIVE_STALE_AFTER_MS) return { tone: "watch", label: `dane sprzed ${formatAge(ageMs)}` };
  if (isDegraded) return { tone: "watch", label: "niepełne dane z Home Assistant" };
  return { tone: "good", label: "aktualne" };
}

// `dailyRows` are the daily totals the usage card reads; null, undefined or empty means no history (PV and
// consumption are then not rated), never an error. `todayRowCapturedAt` is when the capture day's daily row was
// written; without it (null, undefined or unparseable) or when it is older than the snapshot by more than
// DAILY_ROW_MAX_LAG_MS, consumption is not rated.
export function toLiveStateView(
  row: LiveStateRow | null,
  now: Date,
  dailyRows?: DailyEnergyRow[] | null,
  todayRowCapturedAt?: string | null,
): LiveStateView {
  if (!row) return { kind: "empty", status: { tone: "insufficient", label: "laboratorium jeszcze nic nie przesłało" } };

  const capturedAt = new Date(row.captured_at);
  const captured = warsawParts(capturedAt);
  // The capture's Warsaw clock: the verdicts judge "today so far" at this moment, not at `now`.
  const [capturedHour, capturedMinute] = captured.time.split(":").map(Number);
  const capturedClock = {
    hour: capturedHour + capturedMinute / 60,
    month: Number(captured.dayKey.slice(5, 7)),
    time: captured.time,
    dayKey: captured.dayKey,
  };
  const history = dailyRows ?? [];
  const ageMs = now.getTime() - capturedAt.getTime();
  const state = asRecord(row.state);
  const soc = asNumber(state.battery_soc_pct);
  const isDegraded = state.source_health === "degraded";
  const pvWatts = asNumber(state.pv_w);
  const homeLoadWatts = asNumber(state.home_load_w);
  const isStale = ageMs > LIVE_STALE_AFTER_MS;
  const grid = flow(state.grid_w, "pobór z sieci", "oddawanie do sieci");
  const batteryFlow = flow(state.battery_w, "rozładowanie", "ładowanie");
  const socLabel = soc === null ? MISSING : `${wholeNumber.format(soc)}%`;
  // The icon band and the verdict read the same whole percent the label shows, so the number, the icon and the chip
  // never disagree at a line (29,9 shows as 30% and is rated as 30%).
  const socWhole = soc === null ? null : Math.round(soc);

  return {
    kind: "state",
    status: liveStatus(ageMs, isDegraded),
    capturedAtLabel: captured.label,
    ageLabel: formatAge(ageMs),
    isStale,
    isDegraded,
    pv: kwLabel(pvWatts),
    homeLoad: kwLabel(homeLoadWatts),
    grid,
    battery: {
      ...batteryFlow,
      socLabel,
      socPct: soc,
      chargeLevel: chargeLevelOf(socWhole),
    },
    today: {
      pv: kwhLabel(state.pv_today_kwh),
      bought: kwhLabel(state.grid_import_today_kwh),
      sold: kwhLabel(state.grid_export_today_kwh),
      // The lab's "today" totals run from Warsaw midnight to the capture time, on the capture's day.
      periodLabel: `${
        captured.dayKey === warsawParts(now).dayKey ? "dziś" : formatDayMonth(captured.dayKey)
      } od północy do ${captured.time}`,
    },
    flows: {
      pv: motion(pvWatts, isStale),
      home: motion(homeLoadWatts, isStale),
      grid: motion(grid.watts, isStale),
      battery: motion(batteryFlow.watts, isStale),
    },
    verdicts: {
      battery: batteryVerdict(socWhole, socLabel, isStale),
      pv: pvVerdict(capturedClock, asNumber(state.pv_today_kwh), history, isStale),
      home: homeVerdict(capturedClock, capturedAt.getTime(), history, todayRowCapturedAt, now, isStale),
    },
  };
}
