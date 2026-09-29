import type { StatusTone } from "@/lib/format/status";

// One palette for status: the header badges (StatusBadge) and the verdict chips on the flow squares share it.
// The text carries the meaning; the colour only supports it.
export const TONE_CLASSES: Record<StatusTone, string> = {
  good: "border-tone-good/35 bg-tone-good-surface text-tone-good",
  watch: "border-tone-watch/35 bg-tone-watch-surface text-tone-watch",
  problem: "border-tone-problem/35 bg-tone-problem-surface text-tone-problem",
  insufficient: "border-tone-neutral/30 bg-tone-neutral-surface text-tone-neutral",
};
