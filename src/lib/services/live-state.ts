import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveStateRow } from "@/types";
import { asNumber, asRecord, kwhLabel, MISSING, oneDecimal } from "@/lib/format/values";
import { TONE_WORD } from "@/lib/format/status";
import type { Status, StatusTone } from "@/lib/format/status";
import { formatDayMonth, warsawParts } from "@/lib/format/warsaw-time";

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
      pvWatts: number | null;
      homeLoad: string;
      homeLoadWatts: number | null;
      grid: FlowLabel;
      battery: FlowLabel & { socLabel: string; socPct: number | null; chargeLevel: BatteryChargeLevel | null };
      today: { pv: string; bought: string; sold: string; periodLabel: string };
      flows: { pv: FlowMotion; home: FlowMotion; grid: FlowMotion; battery: FlowMotion };
      // pv and home are not rated yet (null).
      verdicts: { battery: NodeVerdict; pv: NodeVerdict | null; home: NodeVerdict | null };
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

export function toLiveStateView(row: LiveStateRow | null, now: Date): LiveStateView {
  if (!row) return { kind: "empty", status: { tone: "insufficient", label: "laboratorium jeszcze nic nie przesłało" } };

  const capturedAt = new Date(row.captured_at);
  const captured = warsawParts(capturedAt);
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
    pvWatts,
    homeLoad: kwLabel(homeLoadWatts),
    homeLoadWatts,
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
    verdicts: { battery: batteryVerdict(socWhole, socLabel, isStale), pv: null, home: null },
  };
}
