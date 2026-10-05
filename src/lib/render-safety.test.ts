import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Lab text and the owner's notes must render as text. Astro's `{}` interpolation escapes; these are the ways to opt out
// of that. None is used in src today, so any new use fails here and needs a reviewed decision.

const SINKS = ["set:html", "dangerouslySetInnerHTML", "innerHTML", "insertAdjacentHTML", "outerHTML"];

// A reviewed exception: path relative to src (forward slashes) -> the sinks that file may contain, and why it is safe.
// Empty today. Add a row only after a review that shows the value is never lab text, user text or anything derived
// from them.
const ALLOWED: Partial<Record<string, { sinks: string[]; reason: string }>> = {};

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
const THIS_FILE = "lib/render-safety.test.ts";

function listSourceFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return listSourceFiles(`${dir}/${entry.name}`, `${prefix}${entry.name}/`);
    return /\.(astro|ts|tsx)$/.test(entry.name) ? [`${prefix}${entry.name}`] : [];
  });
}

describe("render safety", () => {
  it("finds the source files", () => {
    // Guards against a broken walk that would make the sink scan pass on an empty list.
    const files = listSourceFiles(SRC_DIR);

    expect(files).toContain("middleware.ts");
    expect(files).toContain("components/history/DayNotePanel.astro");
  });

  it("uses no HTML-injection sink in src", () => {
    const found: string[] = [];
    for (const file of listSourceFiles(SRC_DIR)) {
      if (file === THIS_FILE) continue;
      const text = readFileSync(`${SRC_DIR}/${file}`, "utf8");
      const allowed = ALLOWED[file]?.sinks ?? [];
      for (const sink of SINKS) {
        if (text.includes(sink) && !allowed.includes(sink)) found.push(`${file}: ${sink}`);
      }
    }

    expect(
      found,
      "markup sinks bypass Astro's escaping; render text with {value}, or add a reviewed row to ALLOWED",
    ).toEqual([]);
  });

  it("gives every allow-list row a reason", () => {
    expect(Object.entries(ALLOWED).filter(([, row]) => (row?.reason ?? "").trim() === "")).toEqual([]);
  });
});

describe("note form attributes", () => {
  const panel = readFileSync(`${SRC_DIR}/components/history/DayNotePanel.astro`, "utf8");
  const hint = "see src/components/history/DayNotePanel.astro: the note form must follow NOTE_MAX_LENGTH";

  it("keeps maxlength and required on the textarea", () => {
    const textarea = /<textarea\b[^>]*>/.exec(panel)?.[0] ?? "";

    expect(textarea, `no <textarea> found; ${hint}`).not.toBe("");
    expect(textarea, `textarea lost maxlength={NOTE_MAX_LENGTH}; ${hint}`).toContain("maxlength={NOTE_MAX_LENGTH}");
    expect(textarea, `textarea lost the required attribute; ${hint}`).toMatch(/\srequired(\s|>|=)/);
  });

  it("states the limit in the label from the constant", () => {
    const label = /<label\b[\s\S]*?<\/label>/.exec(panel)?.[0] ?? "";

    expect(label, `no <label> found; ${hint}`).not.toBe("");
    expect(label, `label text no longer uses {NOTE_MAX_LENGTH}; ${hint}`).toContain("{NOTE_MAX_LENGTH}");
  });
});
