import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NIGHT_END_HOUR, NIGHT_START_HOUR } from "@/lib/services/hourly-usage";
import { GLOSSARY, type GlossaryTerm } from "./glossary";

const logicDoc = readFileSync(fileURLToPath(new URL("../../../docs/logic.md", import.meta.url)), "utf8");
const entries = Object.entries(GLOSSARY) as [GlossaryTerm, { term: string; explanation: string }][];

// The copy is static text, so these tests pin what can silently drift: its shape, and the figures it repeats from
// the code and from docs/logic.md. They do not copy the sentences.
describe("GLOSSARY shape", () => {
  it.each(entries)("%s has a clean term and a one-sentence explanation", (_key, { term, explanation }) => {
    expect(term).toBe(term.trim());
    expect(term.length).toBeGreaterThan(0);
    expect(explanation).toBe(explanation.trim());
    expect(explanation).toMatch(/[.!?]$/);
    expect(explanation).not.toMatch(/ {2}/);
  });

  it("gives every entry its own term and its own explanation", () => {
    expect(new Set(entries.map(([, e]) => e.term)).size).toBe(entries.length);
    expect(new Set(entries.map(([, e]) => e.explanation)).size).toBe(entries.length);
  });
});

describe("GLOSSARY figures follow the code and the logic doc", () => {
  it("names the night window the night-draw figure uses", () => {
    const { explanation } = GLOSSARY.night_grid_draw;
    expect(explanation).toContain(`${String(NIGHT_START_HOUR)}:00`);
    expect(explanation).toContain(`${String(NIGHT_END_HOUR)}:00`);
  });

  it("states the net-metering credit ratio that docs/logic.md gives", () => {
    // The ratio is applied by the lab, not by the app, so docs/logic.md is the written source.
    const ratio = /For every kWh fed in, \*\*([\d.]+)\*\* kWh/.exec(logicDoc)?.[1];
    if (ratio === undefined) throw new Error("docs/logic.md no longer states the net-metering credit ratio");
    expect(GLOSSARY.net_metering.explanation).toContain(`${ratio.replace(".", ",")} kWh`);
  });
});
