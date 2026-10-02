import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TONE_WORD, type StatusTone } from "./status";
import { TONE_CLASSES } from "./tone-classes";

const css = readFileSync(fileURLToPath(new URL("../../styles/global.css", import.meta.url)), "utf8");
const tones = Object.keys(TONE_WORD) as StatusTone[];

// A class naming a colour token that global.css does not define renders the badge unstyled, with no error anywhere.
describe("TONE_CLASSES", () => {
  it("has a class string for every status tone and no other", () => {
    expect(Object.keys(TONE_CLASSES).sort()).toEqual([...tones].sort());
  });

  it("gives every tone its own look", () => {
    expect(new Set(Object.values(TONE_CLASSES)).size).toBe(tones.length);
  });

  it.each(tones)("%s sets a border, a surface and a text colour", (tone) => {
    const classes = TONE_CLASSES[tone].split(/\s+/);
    expect(classes.some((c) => c.startsWith("border-tone-"))).toBe(true);
    expect(classes.some((c) => c.startsWith("bg-tone-"))).toBe(true);
    expect(classes.some((c) => c.startsWith("text-tone-"))).toBe(true);
  });

  it.each(tones)("%s only uses colour tokens that global.css defines", (tone) => {
    const tokens = [...TONE_CLASSES[tone].matchAll(/(?:border|bg|text)-(tone-[a-z-]+)/g)].map((m) => m[1]);
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(css, `--color-${token} is not defined in global.css`).toContain(`--color-${token}:`);
    }
  });
});
