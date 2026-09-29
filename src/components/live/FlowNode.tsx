import { CircleCheck, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { StatusTone } from "@/lib/format/status";
import type { FlowNodeId } from "@/lib/flow-connector-state";
import type { NodeVerdict } from "@/lib/services/live-state";
import { cn } from "@/lib/utils";
import { VerdictChip } from "@/components/live/VerdictChip";

export type NodeId = FlowNodeId;

// The grid is never rated; the artboards show a neutral chip in its place.
const NO_VERDICT_WORD = "Bez oceny";

// Full class names so Tailwind can see them. Columns and rows of the five-column, three-row stage in LiveFlow.
const PLACEMENT: Record<NodeId, string> = {
  pv: "col-start-1 row-start-2",
  home: "col-start-5 row-start-1",
  battery: "col-start-5 row-start-2",
  grid: "col-start-5 row-start-3",
};

// The icon tile is a flat, source-coloured square: a 10% fill and the icon in the source colour.
const TILE_SIZE: Record<NodeId, string> = {
  pv: "size-12 rounded-xl sm:size-16 sm:rounded-2xl",
  home: "size-10 rounded-xl sm:size-14 sm:rounded-2xl",
  battery: "size-10 rounded-xl sm:size-14 sm:rounded-2xl",
  grid: "size-10 rounded-xl sm:size-14 sm:rounded-2xl",
};

const ICON_SIZE: Record<NodeId, string> = {
  pv: "size-6 sm:size-[30px]",
  home: "size-5 sm:size-[26px]",
  battery: "size-5 sm:size-[26px]",
  grid: "size-5 sm:size-[26px]",
};

const TILE_HUE: Record<NodeId, string> = {
  pv: "bg-flow-pv/10 text-flow-pv",
  home: "bg-flow-home/10 text-flow-home",
  battery: "bg-flow-battery/10 text-flow-battery",
  grid: "bg-flow-grid/10 text-flow-grid",
};

// A rated node shows its tone on the tile border (55%); an unrated one keeps a 45% source-colour border.
const TILE_BORDER_UNRATED: Record<NodeId, string> = {
  pv: "border-flow-pv/45",
  home: "border-flow-home/45",
  battery: "border-flow-battery/45",
  grid: "border-flow-grid/45",
};

const TILE_BORDER_RATED: Record<Exclude<StatusTone, "insufficient">, string> = {
  good: "border-tone-good/55",
  watch: "border-tone-watch/55",
  problem: "border-tone-problem/55",
};

// The phone drops the chip, so a rated tile carries the chip's icon on its corner (never colour alone).
const CORNER_GLYPH: Record<Exclude<StatusTone, "insufficient">, { Icon: LucideIcon; className: string }> = {
  good: { Icon: CircleCheck, className: "text-tone-good" },
  watch: { Icon: TriangleAlert, className: "text-tone-watch" },
  problem: { Icon: OctagonAlert, className: "text-tone-problem" },
};

interface FlowNodeProps {
  id: NodeId;
  label: string;
  // The phone label, the only text besides the value below `sm`.
  short: string;
  // Direction words ("ładowanie") appended to the label from `sm`.
  direction: string | null;
  // The battery's "Naładowanie: 74%" under the chip, from `sm`.
  detailLine: string | null;
  value: string;
  // Extra reading words for the accessible name, e.g. the direction ("ładowanie").
  spoken: string;
  Icon: LucideIcon;
  verdict: NodeVerdict | null;
  selected: boolean;
  onSelect: (id: NodeId) => void;
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The chip merges the verdict word and its detail in one line, as in the artboards; no verdict is the neutral chip.
export function chipFor(verdict: NodeVerdict | null): { tone: StatusTone; word: string } {
  if (!verdict) return { tone: "insufficient", word: NO_VERDICT_WORD };
  const word = capitalise(verdict.word);
  return { tone: verdict.tone, word: verdict.detail ? `${word} · ${verdict.detail}` : word };
}

export function FlowNode({
  id,
  label,
  short,
  direction,
  detailLine,
  value,
  spoken,
  Icon,
  verdict,
  selected,
  onSelect,
}: FlowNodeProps) {
  const rated = verdict && verdict.tone !== "insufficient" ? verdict.tone : null;
  const glyph = rated ? CORNER_GLYPH[rated] : null;
  const isPv = id === "pv";
  const chip = chipFor(verdict);

  return (
    <button
      type="button"
      data-node-id={id}
      aria-pressed={selected}
      aria-label={`${label}: ${spoken}${verdict ? `, ${capitalise(verdict.word)}, ${verdict.detail}` : ""}`}
      onClick={() => {
        onSelect(id);
      }}
      className={cn(
        "hover:bg-muted/60 flex min-h-11 min-w-0 cursor-pointer rounded-2xl p-1 text-left transition-colors sm:p-2",
        isPv
          ? "flex-col items-center gap-1.5 sm:flex-row sm:gap-3 md:gap-4"
          : "flex-row items-center gap-2 sm:gap-3 md:gap-3.5",
        PLACEMENT[id],
        selected && "bg-muted ring-primary ring-2",
      )}
    >
      <span
        className={cn(
          "relative flex flex-none items-center justify-center border",
          TILE_SIZE[id],
          TILE_HUE[id],
          rated ? TILE_BORDER_RATED[rated] : TILE_BORDER_UNRATED[id],
        )}
      >
        <Icon className={ICON_SIZE[id]} aria-hidden="true" />
        {glyph && (
          <span
            aria-hidden="true"
            className="bg-card absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full sm:hidden"
          >
            <glyph.Icon className={cn("size-4", glyph.className)} />
          </span>
        )}
      </span>
      <span
        className={cn(
          "flex min-w-0 flex-col gap-0.5 sm:gap-1",
          isPv && "items-center text-center sm:items-start sm:text-left",
        )}
      >
        <span className="text-muted-foreground text-[11px] sm:text-[13px]">
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{direction ? `${label} · ${direction}` : label}</span>
        </span>
        <span
          className={cn(
            "text-card-foreground leading-tight font-bold whitespace-nowrap",
            isPv ? "text-[17px] sm:text-[26px]" : "text-[15px] sm:text-[22px]",
          )}
        >
          {value}
        </span>
        <VerdictChip
          tone={chip.tone}
          word={chip.word}
          className="hidden max-w-full self-start rounded-2xl text-xs sm:inline-flex"
        />
        {detailLine && <span className="text-muted-foreground hidden text-xs sm:block">{detailLine}</span>}
      </span>
    </button>
  );
}
