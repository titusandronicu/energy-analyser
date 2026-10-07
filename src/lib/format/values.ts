// Display helpers for values pushed by the home lab. Pushed jsonb is untrusted, so every reader goes through
// these guards and shows MISSING instead of a wrong or empty value.
export const MISSING = "—";

export const oneDecimal = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// Whole złoty only: the money figures this app shows are estimates carrying a wide range, so grosze would
// assert precision they do not have.
const wholeZloty = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 });

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// "4,8 kWh", or MISSING for anything that isn't a finite number.
export function kwhLabel(value: unknown): string {
  const kwh = asNumber(value);
  return kwh === null ? MISSING : `${oneDecimal.format(kwh)} kWh`;
}

// "258 zł", or MISSING for anything that isn't a finite number.
export function plnLabel(value: unknown): string {
  const pln = asNumber(value);
  return pln === null ? MISSING : `${wholeZloty.format(pln)} zł`;
}

// "brak danych" → "Brak danych", for badges and short labels.
export function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
