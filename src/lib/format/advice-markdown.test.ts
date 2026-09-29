import { describe, expect, it } from "vitest";
import {
  endsWithColonIntro,
  isHeadingBlock,
  parseAdviceMarkdown,
  parseInline,
  splitAdviceLead,
} from "./advice-markdown";

const plain = (text: string) => ({ text, bold: false });
const bold = (text: string) => ({ text, bold: true });

describe("parseInline", () => {
  it("splits bold spans", () => {
    expect(parseInline("Ustaw **rezerwę 30%** na noc.")).toEqual([
      plain("Ustaw "),
      bold("rezerwę 30%"),
      plain(" na noc."),
    ]);
  });

  it("keeps an unmatched marker as literal text", () => {
    expect(parseInline("2 ** 3 to potęga")).toEqual([plain("2 ** 3 to potęga")]);
  });

  it("keeps HTML as plain text for the renderer to escape", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([plain("<script>alert(1)</script>")]);
  });
});

describe("parseAdviceMarkdown", () => {
  it("keeps plain multi-line text as one paragraph with its lines", () => {
    expect(parseAdviceMarkdown("Dziś słonecznie.\nNie ładuj z sieci.")).toEqual([
      { type: "paragraph", lines: [[plain("Dziś słonecznie.")], [plain("Nie ładuj z sieci.")]] },
    ]);
  });

  it("parses the lab's observations/checks shape", () => {
    const text = [
      "**Obserwacje:**",
      "- Eksport 4,8 kWh przy baterii 74%.",
      "* Import niski.",
      "",
      "### Sprawdzenia na jutro",
      "1. Porównaj godziny eksportu.",
      "2) Sprawdź tryb **Time-of-Use**.",
    ].join("\n");
    expect(parseAdviceMarkdown(text)).toEqual([
      { type: "paragraph", lines: [[bold("Obserwacje:")]] },
      { type: "list", ordered: false, items: [[plain("Eksport 4,8 kWh przy baterii 74%.")], [plain("Import niski.")]] },
      { type: "paragraph", lines: [[bold("Sprawdzenia na jutro")]] },
      {
        type: "list",
        ordered: true,
        items: [[plain("Porównaj godziny eksportu.")], [plain("Sprawdź tryb "), bold("Time-of-Use"), plain(".")]],
      },
    ]);
  });

  it("starts a new list when bullets switch to numbers", () => {
    const blocks = parseAdviceMarkdown("- a\n1. b");
    expect(blocks.map((b) => b.type === "list" && b.ordered)).toEqual([false, true]);
  });

  it("ends a list at the next plain line", () => {
    expect(parseAdviceMarkdown("- a\nPodsumowanie.").map((b) => b.type)).toEqual(["list", "paragraph"]);
  });

  it("handles Windows line endings and trailing spaces", () => {
    expect(parseAdviceMarkdown("- a  \r\n- b\r\n")).toEqual([
      { type: "list", ordered: false, items: [[plain("a")], [plain("b")]] },
    ]);
  });

  it("returns nothing for empty text", () => {
    expect(parseAdviceMarkdown("  \n\n")).toEqual([]);
  });
});

// "h" heading, "p" paragraph, "l" list: a compact picture of a split.
function shape(text: string): { lead: string; rest: string } {
  const label = (block: ReturnType<typeof parseAdviceMarkdown>[number]) =>
    block.type === "list" ? "l" : isHeadingBlock(block) ? "h" : "p";
  const { lead, rest } = splitAdviceLead(parseAdviceMarkdown(text));
  return { lead: lead.map(label).join(""), rest: rest.map(label).join("") };
}

describe("splitAdviceLead", () => {
  const longList = Array.from({ length: 60 }, (_, i) => `- Punkt ${String(i + 1)} z dłuższym opisem porady.`).join(
    "\n",
  );

  it.each([
    ["a single paragraph", "Dziś słonecznie.", "p", ""],
    ["two paragraphs", "Pierwszy.\n\nDrugi.", "p", "p"],
    ["heading, paragraph, paragraph", "# Dziś\n\nPierwszy.\n\nDrugi.", "hp", "p"],
    ["a list first (the whole list)", "- a\n- b\n- c\n\nPodsumowanie.", "l", "p"],
    ["a heading only", "# Dziś", "h", ""],
    ["a bold-only line counts as a heading", "**Dziś**\n\nPierwszy.\n\nDrugi.", "hp", "p"],
    ["two headings then a list", "# Dziś\n\n## Jutro\n\n- a\n- b\n\nKoniec.", "hhl", "p"],
    ["empty text", "", "", ""],
    ["a multi-line paragraph is one block", "Linia 1.\nLinia 2.\nLinia 3.\n\nDrugi.", "p", "p"],
    ["one very long list (no cap)", longList, "l", ""],
  ])("splits %s", (_name, text, lead, rest) => {
    expect(shape(text)).toEqual({ lead, rest });
  });

  describe("colon rule", () => {
    it.each([
      ["intro ending in a colon and a list", "Zalecenia na dziś:\n- a\n- b\n\nKoniec.", "pl", "p"],
      ["the same after a leading heading", "# Dziś\n\nZalecenia na dziś:\n- a\n- b\n\nKoniec.", "hpl", "p"],
      ["an intro with trailing spaces", "Zalecenia:  \n- a\n\nKoniec.", "pl", "p"],
      ["an intro followed by a numbered list", "Zalecenia:\n1. a\n2. b\n\nKoniec.", "pl", "p"],
      ["an intro followed by a paragraph (no list joins)", "Zalecenia:\n\nKoniec.\n\n- a", "p", "pl"],
      ["a multi-line intro ending in a colon (no list joins)", "Linia 1.\nZalecenia:\n- a\n- b", "p", "l"],
      ["an intro not ending in a colon (no list joins)", "Zalecenia na dziś.\n- a\n- b", "p", "l"],
      ["only that one list joins", "Zalecenia:\n- a\n\n1. b\n\nKoniec.", "pl", "lp"],
    ])("handles %s", (_name, text, lead, rest) => {
      expect(shape(text)).toEqual({ lead, rest });
    });
  });

  it("keeps the blocks untouched and in order", () => {
    const blocks = parseAdviceMarkdown("# Dziś\n\nZalecenia:\n- a\n\nKoniec.");
    const { lead, rest } = splitAdviceLead(blocks);
    expect([...lead, ...rest]).toEqual(blocks);
  });
});

describe("advice block helpers", () => {
  it("names a heading by one line of one bold segment", () => {
    const [heading, mixed, twoLines] = parseAdviceMarkdown("**Dziś**\n\nCzęść **pogrubiona**\n\n**A**\nB");
    expect([heading, mixed, twoLines].map(isHeadingBlock)).toEqual([true, false, false]);
  });

  it("names an intro by a one-line paragraph ending in a colon", () => {
    const [intro, other, multi, list] = parseAdviceMarkdown("Intro:\n\nInaczej.\n\nA\nB:\n\n- x:");
    expect([intro, other, multi, list].map(endsWithColonIntro)).toEqual([true, false, false, false]);
  });
});
