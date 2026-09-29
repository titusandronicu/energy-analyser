import type { LucideIcon } from "lucide-react";
import type { StatusTone } from "@/lib/format/status";
import type { NodeVerdict } from "@/lib/services/live-state";
import { cn } from "@/lib/utils";
import { VerdictChip } from "@/components/live/VerdictChip";

export type NodeId = "pv" | "home" | "battery" | "grid";

// Full class names so Tailwind can see them. Rated squares get a 2px tone border and tint; unrated ones stay neutral.
const PLACEMENT: Record<NodeId, string> = {
  pv: "col-start-1 row-start-1",
  home: "col-start-3 row-start-1",
  battery: "col-start-1 row-start-2",
  grid: "col-start-3 row-start-2",
};

const ICON_HUE: Record<NodeId, string> = {
  pv: "bg-flow-pv/20 text-flow-pv",
  home: "bg-flow-home/20 text-flow-home",
  battery: "bg-flow-battery/20 text-flow-battery",
  grid: "bg-flow-grid/20 text-flow-grid",
};

const RATED_TINT: Record<Exclude<StatusTone, "insufficient">, string> = {
  good: "border-2 border-tone-good bg-tone-good-surface p-[9px] max-[480px]:px-2 max-[480px]:py-[7px]",
  watch: "border-2 border-tone-watch bg-tone-watch-surface p-[9px] max-[480px]:px-2 max-[480px]:py-[7px]",
  problem: "border-2 border-tone-problem bg-tone-problem-surface p-[9px] max-[480px]:px-2 max-[480px]:py-[7px]",
};

const NEUTRAL = "border border-border bg-muted p-2.5 max-[480px]:px-[9px] max-[480px]:py-2";

interface FlowNodeProps {
  id: NodeId;
  label: string;
  value: string;
  // Extra reading words for the accessible name, e.g. the direction ("ładowanie").
  spoken: string;
  sub: string | null;
  Icon: LucideIcon;
  verdict: NodeVerdict | null;
  selected: boolean;
  onSelect: (id: NodeId) => void;
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function FlowNode({ id, label, value, spoken, sub, Icon, verdict, selected, onSelect }: FlowNodeProps) {
  const verdictWord = verdict ? capitalise(verdict.word) : "";
  const tint = verdict && verdict.tone !== "insufficient" ? RATED_TINT[verdict.tone] : NEUTRAL;

  return (
    <button
      type="button"
      data-node-id={id}
      aria-pressed={selected}
      aria-label={`${label}: ${spoken}${verdict ? `, ${verdictWord}, ${verdict.detail}` : ""}`}
      onClick={() => {
        onSelect(id);
      }}
      className={cn(
        "block w-full min-w-0 cursor-pointer rounded-[14px] text-left transition-[filter] hover:brightness-110",
        PLACEMENT[id],
        tint,
        selected && "shadow-[0_0_0_2px_var(--primary)]",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5 max-[480px]:gap-1.5">
        <span
          className={cn(
            "flex size-8 flex-none items-center justify-center rounded-full max-[480px]:size-[26px]",
            ICON_HUE[id],
          )}
        >
          <Icon className="size-[18px] max-[480px]:size-[15px]" aria-hidden="true" />
        </span>
        <span className="block min-w-0">
          <span className="text-muted-foreground block text-xs">{label}</span>
          <span className="block text-lg leading-tight font-medium whitespace-nowrap max-[480px]:text-base">
            {value}
          </span>
        </span>
      </span>
      {sub && <span className="text-muted-foreground mt-1 block text-xs">{sub}</span>}
      {verdict && (
        <>
          <VerdictChip tone={verdict.tone} word={verdictWord} className="mt-1.5" />
          <span className="text-muted-foreground block text-xs">{verdict.detail}</span>
        </>
      )}
    </button>
  );
}
