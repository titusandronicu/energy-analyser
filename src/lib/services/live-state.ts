import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveStateRow } from "@/types";
import { formatWarsawDateTime } from "./recommendation";

// The lab pushes every few minutes; a snapshot older than 15 minutes no longer describes "now".
export const LIVE_STALE_AFTER_MS = 15 * 60 * 1000;
const MISSING = "—";
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export interface FlowLabel {
  value: string;
  direction: string | null;
}

export type LiveStateView =
  | { kind: "empty" }
  | {
      kind: "state";
      capturedAtLabel: string;
      ageLabel: string;
      isStale: boolean;
      isDegraded: boolean;
      pv: string;
      homeLoad: string;
      grid: FlowLabel;
      battery: FlowLabel & { socLabel: string };
      today: { pv: string; bought: string; sold: string };
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

const oneDecimal = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const wholeNumber = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 });

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function kwLabel(watts: number | null): string {
  return watts === null ? MISSING : `${oneDecimal.format(Math.abs(watts) / 1000)} kW`;
}

function kwhLabel(value: unknown): string {
  const kwh = asNumber(value);
  return kwh === null ? MISSING : `${oneDecimal.format(kwh)} kWh`;
}

// Sign conventions follow the ingest contract: the value is shown unsigned and the sign becomes a direction.
function flow(value: unknown, positive: string, negative: string): FlowLabel {
  const watts = asNumber(value);
  const direction = watts === null || watts === 0 ? null : watts > 0 ? positive : negative;
  return { value: kwLabel(watts), direction };
}

// "5 min" under an hour, "2 godz." under a day, "3 dni" beyond. A capture time in the future counts as 0.
export function formatAge(ageMs: number): string {
  const age = Math.max(0, ageMs);
  if (age < HOUR_MS) return `${String(Math.floor(age / MINUTE_MS))} min`;
  if (age < DAY_MS) return `${String(Math.floor(age / HOUR_MS))} godz.`;
  const days = Math.floor(age / DAY_MS);
  return days === 1 ? "1 dzień" : `${String(days)} dni`;
}

export function toLiveStateView(row: LiveStateRow | null, now: Date): LiveStateView {
  if (!row) return { kind: "empty" };

  const capturedAt = new Date(row.captured_at);
  const ageMs = now.getTime() - capturedAt.getTime();
  const state = asRecord(row.state);
  const soc = asNumber(state.battery_soc_pct);

  return {
    kind: "state",
    capturedAtLabel: formatWarsawDateTime(capturedAt),
    ageLabel: formatAge(ageMs),
    isStale: ageMs > LIVE_STALE_AFTER_MS,
    isDegraded: state.source_health === "degraded",
    pv: kwLabel(asNumber(state.pv_w)),
    homeLoad: kwLabel(asNumber(state.home_load_w)),
    grid: flow(state.grid_w, "pobór z sieci", "oddawanie do sieci"),
    battery: {
      ...flow(state.battery_w, "rozładowanie", "ładowanie"),
      socLabel: soc === null ? MISSING : `${wholeNumber.format(soc)}%`,
    },
    today: {
      pv: kwhLabel(state.pv_today_kwh),
      bought: kwhLabel(state.grid_import_today_kwh),
      sold: kwhLabel(state.grid_export_today_kwh),
    },
  };
}
