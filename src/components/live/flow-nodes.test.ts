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
} from "lucide-react";
import { describe, expect, it } from "vitest";
import type { NodeVerdict } from "@/lib/services/live-state";
import type { LiveFlowProps } from "./LiveFlow";
import { buildNodes } from "./flow-nodes";

// buildNodes turns the live state view's labels into the four diagram nodes. All data here is synthetic.

const verdict = (word: string): NodeVerdict => ({
  tone: "good",
  word,
  detail: `${word} — szczegół`,
  explanation: `Wyjaśnienie: ${word}.`,
});

const motion = { watts: null, moving: false };

function props(overrides: Partial<Pick<LiveFlowProps, "grid" | "battery">> = {}): LiveFlowProps {
  return {
    pv: "3,4 kW",
    homeLoad: "0,9 kW",
    grid: { value: "0 W", direction: null, watts: null },
    battery: {
      value: "1,2 kW",
      direction: null,
      watts: null,
      socLabel: "65%",
      socPct: 65,
      chargeLevel: "medium",
      charging: false,
    },
    balance: { watts: 0, label: "0 W", word: null },
    flows: { pv: motion, home: motion, grid: motion, battery: motion },
    verdicts: { battery: verdict("dobrze"), pv: verdict("świetnie"), home: verdict("normalnie") },
    capturedAtLabel: "25 września 2026, 12:00",
    ageLabel: "5 min",
    isStale: false,
    ...overrides,
  };
}

const node = (p: LiveFlowProps, id: string) => {
  const found = buildNodes(p).find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
};

describe("buildNodes", () => {
  it("builds the four nodes in the diagram's order with their labels and readings", () => {
    const nodes = buildNodes(props());

    expect(nodes.map((n) => [n.id, n.label, n.short, n.value])).toEqual([
      ["pv", "Produkcja PV", "Panele", "3,4 kW"],
      ["home", "Zużycie domu", "Dom", "0,9 kW"],
      ["battery", "Bateria", "Bateria", "1,2 kW"],
      ["grid", "Sieć", "Sieć", "0 W"],
    ]);
    expect(nodes.map((n) => n.Icon)).toEqual([Sun, House, BatteryMedium, TowerControl]);
  });

  it("takes each rated node's verdict and its explanation", () => {
    const p = props();

    expect(node(p, "pv")).toMatchObject({
      verdict: p.verdicts.pv,
      why: p.verdicts.pv.explanation,
      terms: ["pv", "kw"],
    });
    expect(node(p, "home")).toMatchObject({
      verdict: p.verdicts.home,
      why: p.verdicts.home.explanation,
      terms: ["kw"],
    });
    expect(node(p, "battery")).toMatchObject({
      verdict: p.verdicts.battery,
      why: p.verdicts.battery.explanation,
      terms: ["kw", "battery_soc"],
    });
  });

  it("never rates the grid and says why", () => {
    expect(node(props(), "grid")).toMatchObject({
      verdict: null,
      why: "Sieć nie ma oceny: pobór ani oddawanie nie są ani dobre, ani złe same w sobie. Pokazujemy tylko kierunek.",
    });
  });

  describe("battery", () => {
    it.each([
      ["full", BatteryFull],
      ["medium", BatteryMedium],
      ["low", BatteryLow],
      ["warning", BatteryWarning],
      [null, Battery],
    ] as const)("shows the %s charge-level icon", (chargeLevel, Icon) => {
      const base = props();

      expect(node({ ...base, battery: { ...base.battery, chargeLevel } }, "battery").Icon).toBe(Icon);
    });

    it("shows the charging icon whatever the charge level", () => {
      const base = props();
      const charging = { ...base.battery, charging: true, direction: "ładowanie", chargeLevel: "full" as const };

      expect(node({ ...base, battery: charging }, "battery").Icon).toBe(BatteryCharging);
    });

    it("says the charge level in the sub line, the detail line and the spoken reading, with no direction", () => {
      expect(node(props(), "battery")).toMatchObject({
        direction: null,
        detailLine: "Naładowanie: 65%",
        sub: "Naładowanie: 65%",
        spoken: "1,2 kW, naładowanie 65%",
      });
    });

    it("adds the direction to the sub line and the spoken reading", () => {
      const base = props();

      expect(node({ ...base, battery: { ...base.battery, direction: "ładowanie" } }, "battery")).toMatchObject({
        direction: "ładowanie",
        sub: "Naładowanie: 65% · ładowanie",
        spoken: "1,2 kW, ładowanie, naładowanie 65%",
      });
    });
  });

  describe("grid", () => {
    it("has no flow: the sub line says so and only the unit term applies", () => {
      expect(node(props(), "grid")).toMatchObject({
        direction: null,
        sub: "bez przepływu",
        spoken: "0 W",
        terms: ["kw"],
      });
    });

    it("explains import when it draws from the grid", () => {
      expect(node(props({ grid: { value: "1,5 kW", direction: "pobór", watts: 1500 } }), "grid")).toMatchObject({
        direction: "pobór",
        sub: "pobór",
        spoken: "1,5 kW, pobór",
        terms: ["kw", "grid_import"],
      });
    });

    it("explains export when it gives to the grid", () => {
      expect(node(props({ grid: { value: "2 kW", direction: "oddawanie", watts: -2000 } }), "grid")).toMatchObject({
        sub: "oddawanie",
        spoken: "2 kW, oddawanie",
        terms: ["kw", "grid_export"],
      });
    });

    it("treats a direction without a reading as export", () => {
      expect(node(props({ grid: { value: "—", direction: "oddawanie", watts: null } }), "grid").terms).toEqual([
        "kw",
        "grid_export",
      ]);
    });
  });
});
