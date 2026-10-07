import { Info, Scale } from "lucide-react";
import { useState, type ReactNode } from "react";
import { usePreference } from "@/components/hooks/usePreference";
import { Button } from "@/components/ui/button";
import { FlowNode, chipFor, type NodeId } from "@/components/live/FlowNode";
import { buildNodes } from "@/components/live/flow-nodes";
import { capitalize } from "@/lib/format/values";
import { VerdictChip } from "@/components/live/VerdictChip";
import { useFlowLines } from "@/components/hooks/useFlowLines";
import { connectorState } from "@/lib/flow-connector-state";
import { flowPath } from "@/lib/flow-geometry";
import { GLOSSARY } from "@/lib/format/glossary";
import { FLOW_PAUSED_KEY, FLOW_VIEW_KEY } from "@/lib/preferences";
import type { LiveStateView } from "@/lib/services/live-state";
import { cn } from "@/lib/utils";

type StateView = Extract<LiveStateView, { kind: "state" }>;

// The serializable part of the "state" view: everything the diagram and the readings list show, nothing else.
export type LiveFlowProps = Pick<
  StateView,
  "pv" | "homeLoad" | "grid" | "battery" | "balance" | "flows" | "verdicts" | "capturedAtLabel" | "ageLabel" | "isStale"
> & {
  // Named Astro slots: the card's title row (heading and badge) and the notices above the diagram.
  heading?: ReactNode;
  notices?: ReactNode;
};

const VIEWS = ["diagram", "readings"] as const;
const PAUSED = ["0", "1"] as const;

const LINE_TEXT: Record<NodeId, string> = {
  pv: "text-flow-pv",
  home: "text-flow-home",
  battery: "text-flow-battery",
  grid: "text-flow-grid",
};

// PV feeds the hub from the left; the other three nodes sit in the right column.
const HUB_SIDE: Record<NodeId, "left" | "right"> = { pv: "left", home: "right", battery: "right", grid: "right" };

const LEGEND = [
  { tone: "good", word: "Dobrze" },
  { tone: "watch", word: "Warto sprawdzić" },
  { tone: "problem", word: "Problem" },
  { tone: "insufficient", word: "Bez oceny" },
] as const;

export function LiveFlow(props: LiveFlowProps) {
  const { flows, balance, capturedAtLabel, ageLabel, isStale, heading, notices } = props;
  // View and pause survive the periodic page reload; the selected node and the readings never do.
  const [view, setView] = usePreference(FLOW_VIEW_KEY, VIEWS, "diagram");
  const [pausedValue, setPausedValue] = usePreference(FLOW_PAUSED_KEY, PAUSED, "0");
  const paused = pausedValue === "1";
  const [selected, setSelected] = useState<NodeId>("battery");
  const { stageRef, layout } = useFlowLines(view === "diagram");

  const nodes = buildNodes(props);
  const details = nodes.find((node) => node.id === selected) ?? nodes[0];
  const detailsChip = chipFor(details.verdict);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {heading}
        <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
          <div
            className="border-border bg-muted flex flex-1 rounded-xl border p-1 sm:flex-none"
            role="group"
            aria-label="Widok"
          >
            <Button
              type="button"
              variant="ghost"
              aria-pressed={view === "diagram"}
              className={cn(
                "h-[38px] flex-1 rounded-[9px] border px-4 text-sm sm:h-9 sm:flex-none",
                view === "diagram"
                  ? "border-primary/45 bg-primary/15 text-foreground hover:bg-primary/15 font-semibold"
                  : "text-muted-foreground border-transparent",
              )}
              onClick={() => {
                setView("diagram");
              }}
            >
              Schemat
            </Button>
            <Button
              type="button"
              variant="ghost"
              aria-pressed={view === "readings"}
              className={cn(
                "h-[38px] flex-1 rounded-[9px] border px-4 text-sm sm:h-9 sm:flex-none",
                view === "readings"
                  ? "border-primary/45 bg-primary/15 text-foreground hover:bg-primary/15 font-semibold"
                  : "text-muted-foreground border-transparent",
              )}
              onClick={() => {
                setView("readings");
              }}
            >
              Odczyty
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            aria-pressed={paused}
            className={cn(
              "border-border-strong h-11 rounded-xl bg-transparent px-3 text-[13px] sm:px-4 sm:text-sm",
              paused && "bg-primary/15 hover:bg-primary/15",
            )}
            onClick={() => {
              setPausedValue(paused ? "0" : "1");
            }}
          >
            <span>
              {paused ? "Wznów" : "Wstrzymaj"}
              <span className="sr-only sm:not-sr-only"> ruch</span>
            </span>
          </Button>
        </div>
      </div>

      {notices}

      {view === "diagram" ? (
        <>
          <div className="bg-inset border-hairline rounded-2xl border px-1 py-2 sm:px-3 sm:py-6 md:px-8">
            <div ref={stageRef} className="relative">
              {layout && (
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 size-full overflow-visible"
                  viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
                >
                  {nodes.map(({ id }) => {
                    const rect = layout.nodes[id];
                    if (!rect) return null;
                    const state = connectorState(id, flows[id], { paused, isStale });
                    const path = flowPath(
                      rect,
                      layout.junction,
                      HUB_SIDE[id],
                      state.kind === "active" ? state.direction : 1,
                    );
                    if (!path) return null;
                    if (state.kind === "idle") {
                      return (
                        <path
                          key={id}
                          d={path.d}
                          className="text-border"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeDasharray="2 6"
                          fill="none"
                        />
                      );
                    }
                    return (
                      <g key={id} className={cn(LINE_TEXT[id], state.dimmed && "opacity-65")}>
                        <path
                          d={path.d}
                          className={cn(state.animated && "animate-flow-dash")}
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeDasharray="6 8"
                          fill="none"
                        />
                        <path
                          d="M-8 -6 L0 0 L-8 6"
                          transform={`translate(${String(path.end.x)},${String(path.end.y)}) rotate(${String(path.angle)})`}
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </g>
                    );
                  })}
                </svg>
              )}
              <div className="grid auto-rows-fr grid-cols-[70px_minmax(16px,1fr)_56px_minmax(16px,1fr)_114px] grid-rows-3 items-center sm:grid-cols-[minmax(0,300px)_minmax(24px,1fr)_100px_minmax(24px,1fr)_minmax(0,300px)]">
                {nodes.map((node) => (
                  <FlowNode
                    key={node.id}
                    id={node.id}
                    label={node.label}
                    short={node.short}
                    direction={node.direction}
                    detailLine={node.detailLine}
                    value={node.value}
                    spoken={node.spoken}
                    Icon={node.Icon}
                    verdict={node.verdict}
                    selected={node.id === selected}
                    onSelect={setSelected}
                  />
                ))}
                <div className="relative col-start-3 row-start-2 flex justify-center">
                  <span
                    data-flow-junction
                    aria-hidden="true"
                    className="border-primary bg-muted text-primary flex size-14 items-center justify-center rounded-full border shadow-[0_8px_24px_color-mix(in_srgb,var(--primary)_18%,transparent)] sm:size-[76px]"
                  >
                    <Scale className="size-[26px] sm:size-[34px]" />
                  </span>
                  <div
                    className={cn(
                      "pointer-events-none absolute top-full left-1/2 mt-2 w-24 -translate-x-1/2 text-center sm:w-40",
                      isStale && "opacity-70",
                    )}
                  >
                    <span className="text-muted-foreground mx-auto block max-w-16 text-[11px] leading-tight sm:max-w-none sm:text-[13px]">
                      Bilans systemu
                    </span>
                    <span className="text-primary block text-[15px] font-bold whitespace-nowrap sm:text-[22px]">
                      {balance.label}
                      {balance.word && <span className="sr-only"> {balance.word}</span>}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-muted space-y-1 rounded-lg p-3 text-sm" aria-live="polite" aria-atomic="true">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                <Info className="mr-1 inline size-4 align-text-bottom" aria-hidden="true" />
                <span className="font-medium">{details.label}</span> · {details.spoken}
              </span>
              <VerdictChip tone={detailsChip.tone} word={detailsChip.word} className="rounded-2xl" />
            </p>
            <p>{details.why}</p>
            {details.terms.map((term) => (
              <p key={term} className="text-muted-foreground">
                <span className="font-medium">{GLOSSARY[term].term}:</span> {GLOSSARY[term].explanation}
              </p>
            ))}
            <p className="text-muted-foreground text-xs">
              Odczyt z {capturedAtLabel} ({ageLabel} temu){isStale ? " · dane nieaktualne" : ""}
            </p>
          </div>

          <div className="text-muted-foreground flex flex-wrap gap-x-3.5 gap-y-2 text-xs">
            {LEGEND.map(({ tone, word }) => (
              <VerdictChip key={tone} tone={tone} word={word} />
            ))}
          </div>
        </>
      ) : (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {nodes.map((node) => (
            <div key={node.id} className="bg-muted rounded-lg p-3">
              <dt className="text-muted-foreground">{node.label}</dt>
              <dd className="text-lg font-medium">{node.value}</dd>
              {node.sub && <dd className="text-muted-foreground text-xs">{node.sub}</dd>}
              {node.verdict && (
                <dd className="mt-1.5">
                  <VerdictChip tone={node.verdict.tone} word={capitalize(node.verdict.word)} />
                  <span className="text-muted-foreground block text-xs">{node.verdict.detail}</span>
                </dd>
              )}
            </div>
          ))}
          <div className="bg-muted col-span-full rounded-lg p-3" data-testid="live-balance">
            <dt className="text-muted-foreground">Bilans systemu</dt>
            <dd className="text-lg font-medium">{balance.label}</dd>
            {balance.word && <dd className="text-muted-foreground text-xs">{balance.word}</dd>}
          </div>
        </dl>
      )}
    </div>
  );
}
