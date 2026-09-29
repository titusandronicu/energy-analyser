import {
  Battery,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  Home,
  Info,
  List,
  Network,
  Pause,
  Play,
  Scale,
  Sun,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { usePreference } from "@/components/hooks/usePreference";
import { Button } from "@/components/ui/button";
import { FlowNode, capitalise, type NodeId } from "@/components/live/FlowNode";
import { VerdictChip } from "@/components/live/VerdictChip";
import { useFlowLines } from "@/components/hooks/useFlowLines";
import { connector } from "@/lib/flow-geometry";
import { GLOSSARY, type GlossaryTerm } from "@/lib/format/glossary";
import { FLOW_PAUSED_KEY, FLOW_VIEW_KEY } from "@/lib/preferences";
import { MIN_FLOW_W } from "@/lib/services/live-state";
import type { LiveStateView } from "@/lib/services/live-state";
import { cn } from "@/lib/utils";

type StateView = Extract<LiveStateView, { kind: "state" }>;

// The serializable part of the "state" view: everything the diagram and the readings list show, nothing else.
export type LiveFlowProps = Pick<
  StateView,
  "pv" | "homeLoad" | "grid" | "battery" | "flows" | "verdicts" | "capturedAtLabel" | "ageLabel" | "isStale"
>;

const VIEWS = ["diagram", "readings"] as const;
const PAUSED = ["0", "1"] as const;

interface NodeData {
  id: NodeId;
  label: string;
  Icon: LucideIcon;
  value: string;
  // The reading in words: value plus direction and, for the battery, the charge level.
  spoken: string;
  sub: string | null;
  verdict: StateView["verdicts"]["battery"] | null;
  // What the details strip says about the rating; the verdict's own explanation when there is one.
  why: string;
  terms: GlossaryTerm[];
}

const LINE_TEXT: Record<NodeId, string> = {
  pv: "text-flow-pv",
  home: "text-flow-home",
  battery: "text-flow-battery",
  grid: "text-flow-grid",
};

// Charging wins regardless of level; otherwise the icon follows the mapper-owned charge-level band.
function batteryIcon(battery: LiveFlowProps["battery"]): LucideIcon {
  if (battery.direction === "ładowanie") return BatteryCharging;
  switch (battery.chargeLevel) {
    case "full":
      return BatteryFull;
    case "medium":
      return BatteryMedium;
    case "low":
      return BatteryLow;
    case "warning":
      return BatteryWarning;
    case null:
      return Battery;
  }
}

function withDirection(value: string, direction: string | null): string {
  return direction ? `${value}, ${direction}` : value;
}

function buildNodes(props: LiveFlowProps): NodeData[] {
  const { pv, homeLoad, grid, battery, verdicts } = props;
  const notRated = "Ten odczyt nie jest jeszcze oceniany.";
  return [
    {
      id: "pv",
      label: "Produkcja PV",
      Icon: Sun,
      value: pv,
      spoken: pv,
      sub: null,
      verdict: verdicts.pv,
      why: verdicts.pv?.explanation ?? notRated,
      terms: ["pv", "kw"],
    },
    {
      id: "home",
      label: "Zużycie domu",
      Icon: Home,
      value: homeLoad,
      spoken: homeLoad,
      sub: null,
      verdict: verdicts.home,
      why: verdicts.home?.explanation ?? notRated,
      terms: ["kw"],
    },
    {
      id: "battery",
      label: "Bateria",
      Icon: batteryIcon(battery),
      value: battery.value,
      spoken: `${withDirection(battery.value, battery.direction)}, naładowanie ${battery.socLabel}`,
      sub: `Naładowanie: ${battery.socLabel}${battery.direction ? ` · ${battery.direction}` : ""}`,
      verdict: verdicts.battery,
      why: verdicts.battery.explanation,
      terms: ["kw", "battery_soc"],
    },
    {
      id: "grid",
      label: "Sieć",
      Icon: Zap,
      value: grid.value,
      spoken: withDirection(grid.value, grid.direction),
      sub: grid.direction ?? "bez przepływu",
      verdict: null,
      why: "Sieć nie ma oceny: pobór ani oddawanie nie są ani dobre, ani złe same w sobie. Pokazujemy tylko kierunek.",
      terms: grid.direction === null ? ["kw"] : ["kw", (grid.watts ?? 0) > 0 ? "grid_import" : "grid_export"],
    },
  ];
}

const SIDE: Record<NodeId, "left" | "right"> = { pv: "left", battery: "left", home: "right", grid: "right" };

// Which way the arrow points, 1 = node to junction. PV always feeds the junction and the junction always feeds
// the home; grid import (positive) and battery discharge (positive) feed the junction, the reverse leaves it.
function flowDirection(id: NodeId, watts: number | null): 1 | -1 {
  if (id === "pv") return 1;
  if (id === "home") return -1;
  return watts !== null && watts > 0 ? 1 : -1;
}

function isActive(watts: number | null): boolean {
  return watts !== null && Math.abs(watts) >= MIN_FLOW_W;
}

const LEGEND = [
  { tone: "good", word: "Dobrze" },
  { tone: "watch", word: "Warto sprawdzić" },
  { tone: "problem", word: "Problem" },
  { tone: "insufficient", word: "Bez oceny" },
] as const;

export function LiveFlow(props: LiveFlowProps) {
  const { flows, capturedAtLabel, ageLabel, isStale } = props;
  // View and pause survive the periodic page reload; the selected node and the readings never do.
  const [view, setView] = usePreference(FLOW_VIEW_KEY, VIEWS, "diagram");
  const [pausedValue, setPausedValue] = usePreference(FLOW_PAUSED_KEY, PAUSED, "0");
  const paused = pausedValue === "1";
  const [selected, setSelected] = useState<NodeId>("battery");
  const { stageRef, layout } = useFlowLines(view === "diagram");

  const nodes = buildNodes(props);
  const details = nodes.find((node) => node.id === selected) ?? nodes[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-1.5">
        <div className="flex gap-1.5" role="group" aria-label="Widok">
          <Button
            type="button"
            size="sm"
            variant={view === "diagram" ? "outline" : "ghost"}
            aria-pressed={view === "diagram"}
            onClick={() => {
              setView("diagram");
            }}
          >
            <Network aria-hidden="true" />
            Schemat
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "readings" ? "outline" : "ghost"}
            aria-pressed={view === "readings"}
            onClick={() => {
              setView("readings");
            }}
          >
            <List aria-hidden="true" />
            Odczyty
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          variant={paused ? "outline" : "ghost"}
          aria-pressed={paused}
          onClick={() => {
            setPausedValue(paused ? "0" : "1");
          }}
        >
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          {paused ? "Wznów ruch" : "Wstrzymaj ruch"}
        </Button>
      </div>

      {view === "diagram" ? (
        <>
          <div ref={stageRef} className="relative mx-auto max-w-[720px]">
            {layout && (
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 size-full overflow-visible"
                viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
              >
                {nodes.map(({ id }) => {
                  const rect = layout.nodes[id];
                  if (!rect) return null;
                  const watts = flows[id].watts;
                  const active = isActive(watts);
                  const line = connector(rect, layout.junction, SIDE[id], active ? flowDirection(id, watts) : 1);
                  const d = `M${String(line.start.x)} ${String(line.start.y)} L${String(line.end.x)} ${String(line.end.y)}`;
                  if (!active) {
                    return (
                      <path
                        key={id}
                        d={d}
                        className="text-border"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeDasharray="2 6"
                        fill="none"
                      />
                    );
                  }
                  const animated = flows[id].moving && !paused;
                  return (
                    <g key={id} className={cn(LINE_TEXT[id], isStale && "opacity-45")}>
                      <path
                        d={d}
                        className={cn(animated && "animate-flow-dash")}
                        stroke="currentColor"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        fill="none"
                      />
                      <polygon
                        points="-6,-5 6,0 -6,5"
                        fill="currentColor"
                        transform={`translate(${String(line.mid.x)},${String(line.mid.y)}) rotate(${String(line.angle)})`}
                      />
                    </g>
                  );
                })}
              </svg>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)_92px_minmax(0,1fr)] items-stretch gap-y-9 max-[480px]:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)]">
              {nodes.map((node) => (
                <FlowNode
                  key={node.id}
                  id={node.id}
                  label={node.label}
                  value={node.value}
                  spoken={node.spoken}
                  sub={node.sub}
                  Icon={node.Icon}
                  verdict={node.verdict}
                  selected={node.id === selected}
                  onSelect={setSelected}
                />
              ))}
              <span
                data-flow-junction
                aria-hidden="true"
                className="border-muted-foreground/50 bg-muted text-ring col-start-2 row-span-2 row-start-1 flex size-[34px] items-center justify-center self-center justify-self-center rounded-full border"
              >
                <Scale className="size-[18px]" />
              </span>
            </div>
          </div>

          <div className="bg-muted space-y-1 rounded-lg p-3 text-sm" aria-live="polite">
            <p>
              <Info className="mr-1 inline size-4 align-text-bottom" aria-hidden="true" />
              <span className="font-medium">{details.label}</span> · {details.spoken}
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
                  <VerdictChip tone={node.verdict.tone} word={capitalise(node.verdict.word)} />
                  <span className="text-muted-foreground block text-xs">{node.verdict.detail}</span>
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
