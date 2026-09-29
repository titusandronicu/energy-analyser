import { oneDecimal } from "@/lib/format/values";

// Absorbs floating point error so a percentage of exactly x.x5 rounds the same way everywhere.
const EPSILON = 1e-9;

// The one rule for a percentage that sits on a verdict line. A whole percent equal to the edge could read "+20%"
// next to either status, so it is shown with one decimal: exactly on the line is "20,0%" (the milder status) and
// anything past it at least "20,1%", decided by the same rule as the status.
//
// `raw` is the signed, unrounded percentage (20.3), `edge` the line in whole percent (20) and `milder` whether the
// milder status applies. The helper only formats; each caller decides when it applies and what `milder` is.
export function edgePercentLabel(raw: number, edge: number, milder: boolean): string {
  const tenths = Math.round(Math.abs(raw) * 10 + EPSILON) / 10;
  const shown = milder ? Math.min(tenths, edge) : Math.max(tenths, edge + 0.1);
  const sign = raw < 0 ? "−" : "+";
  return `${sign}${oneDecimal.format(shown)}%`;
}
