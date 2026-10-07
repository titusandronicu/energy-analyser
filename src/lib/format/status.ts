import { capitalize } from "@/lib/format/values";

// Shared status vocabulary for the dashboard cards. Every tone has a word, so the colour only supports the text.
export type StatusTone = "good" | "watch" | "problem" | "insufficient";

// `label` is the card-specific detail, e.g. "w normie" or "dane sprzed 40 min".
export interface Status {
  tone: StatusTone;
  label: string;
}

export const TONE_WORD: Record<StatusTone, string> = {
  good: "dobrze",
  watch: "warto sprawdzić",
  problem: "problem",
  insufficient: "za mało danych",
};

// "Dobrze · w normie", or just "Za mało danych" when there is no detail.
export function statusText(status: Status): string {
  const word = TONE_WORD[status.tone];
  const text = status.label ? `${word} · ${status.label}` : word;
  return capitalize(text);
}

// A card whose data failed to load: the page never throws a 500 for a data problem.
export const LOAD_FAILED: Status = { tone: "problem", label: "nie udało się wczytać" };

// A badge that rates nothing: the neutral tone with no detail ("za mało danych").
export const NO_STATUS: Status = { tone: "insufficient", label: "" };
