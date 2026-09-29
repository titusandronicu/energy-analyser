import type { StatusTone } from "@/lib/format/status";

// One palette for status: the header badges (StatusBadge) and the verdict chips on the flow squares share it.
// The text carries the meaning; the colour only supports it.
export const TONE_CLASSES: Record<StatusTone, string> = {
  good: "border-tone-good/40 bg-tone-good-surface/60 text-tone-good",
  watch: "border-tone-watch/40 bg-tone-watch-surface/60 text-tone-watch",
  problem: "border-tone-problem/40 bg-tone-problem-surface/60 text-tone-problem",
  insufficient: "border-white/15 bg-white/10 text-blue-100",
};
