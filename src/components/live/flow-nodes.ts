import {
  Battery,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  House,
  Sun,
  TowerControl,
  type LucideIcon,
} from "lucide-react";
import type { NodeId } from "@/components/live/FlowNode";
import type { LiveFlowProps } from "@/components/live/LiveFlow";
import type { GlossaryTerm } from "@/lib/format/glossary";
import type { NodeVerdict } from "@/lib/services/live-state";

// The four nodes of the live flow diagram, built from the live state view's labels. Pure data, so it has its own test
// (flow-nodes.test.ts); LiveFlow.tsx only renders them.

export interface NodeData {
  id: NodeId;
  label: string;
  // The phone label; direction and the detail line only show from `sm` (the details strip carries them on the phone).
  short: string;
  direction: string | null;
  detailLine: string | null;
  Icon: LucideIcon;
  value: string;
  // The reading in words: value plus direction and, for the battery, the charge level.
  spoken: string;
  sub: string | null;
  verdict: NodeVerdict | null;
  // What the details strip says about the rating; the verdict's own explanation when there is one.
  why: string;
  terms: GlossaryTerm[];
}

// Charging wins regardless of level; otherwise the icon follows the mapper-owned charge-level band.
function batteryIcon(battery: LiveFlowProps["battery"]): LucideIcon {
  if (battery.charging) return BatteryCharging;
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

export function buildNodes(props: LiveFlowProps): NodeData[] {
  const { pv, homeLoad, grid, battery, verdicts } = props;
  return [
    {
      id: "pv",
      label: "Produkcja PV",
      short: "Panele",
      direction: null,
      detailLine: null,
      Icon: Sun,
      value: pv,
      spoken: pv,
      sub: null,
      verdict: verdicts.pv,
      why: verdicts.pv.explanation,
      terms: ["pv", "kw"],
    },
    {
      id: "home",
      label: "Zużycie domu",
      short: "Dom",
      direction: null,
      detailLine: null,
      Icon: House,
      value: homeLoad,
      spoken: homeLoad,
      sub: null,
      verdict: verdicts.home,
      why: verdicts.home.explanation,
      terms: ["kw"],
    },
    {
      id: "battery",
      label: "Bateria",
      short: "Bateria",
      direction: battery.direction,
      detailLine: `Naładowanie: ${battery.socLabel}`,
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
      short: "Sieć",
      direction: grid.direction,
      detailLine: null,
      Icon: TowerControl,
      value: grid.value,
      spoken: withDirection(grid.value, grid.direction),
      sub: grid.direction ?? "bez przepływu",
      verdict: null,
      why: "Sieć nie ma oceny: pobór ani oddawanie nie są ani dobre, ani złe same w sobie. Pokazujemy tylko kierunek.",
      terms: grid.direction === null ? ["kw"] : ["kw", (grid.watts ?? 0) > 0 ? "grid_import" : "grid_export"],
    },
  ];
}
