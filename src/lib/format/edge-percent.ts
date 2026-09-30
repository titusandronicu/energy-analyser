import { oneDecimal } from "@/lib/format/values";

// Absorbs floating point error so a percentage of exactly x.x5 rounds the same way everywhere.
const EPSILON = 1e-9;

// The magnitude shown for a value on a verdict line: one decimal, clamped to the edge on the milder side and to one
// tenth past it otherwise, so the printed figure never contradicts the status.
function edgeTenths(raw: number, edge: number, milder: boolean): number {
  const tenths = Math.round(Math.abs(raw) * 10 + EPSILON) / 10;
  return milder ? Math.min(tenths, edge) : Math.max(tenths, edge + 0.1);
}

// The one rule for a percentage that sits on a verdict line. A whole percent equal to the edge could read "+20%"
// next to either status, so it is shown with one decimal: exactly on the line is "20,0%" (the milder status) and
// anything past it at least "20,1%", decided by the same rule as the status.
//
// `raw` is the signed, unrounded percentage (20.3), `edge` the line in whole percent (20) and `milder` whether the
// milder status applies. The helper only formats; each caller decides when it applies and what `milder` is.
export function edgePercentLabel(raw: number, edge: number, milder: boolean): string {
  const sign = raw < 0 ? "−" : "+";
  return `${sign}${oneDecimal.format(edgeTenths(raw, edge, milder))}%`;
}

// The same rule for a gap in percentage points, printed without a sign because the sentence says the direction
// ("27,4 punktu poniżej normy"). One decimal always takes "punktu": exactly on the line is "10,0 punktu" (the milder
// status) and anything past it at least "10,1 punktu".
export function edgePointsLabel(raw: number, edge: number, milder: boolean): string {
  return `${oneDecimal.format(edgeTenths(raw, edge, milder))} punktu`;
}
