import { CircleCheck, Minus, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { StatusTone } from "@/lib/format/status";
import { TONE_CLASSES } from "@/lib/format/tone-classes";
import { cn } from "@/lib/utils";

const TONE_ICON: Record<StatusTone, LucideIcon> = {
  good: CircleCheck,
  watch: TriangleAlert,
  problem: OctagonAlert,
  insufficient: Minus,
};

interface VerdictChipProps {
  tone: StatusTone;
  word: string;
  className?: string;
}

// Icon and word, never colour alone. The same classes as the header StatusBadge.
export function VerdictChip({ tone, word, className }: VerdictChipProps) {
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px] leading-snug font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {word}
    </span>
  );
}
