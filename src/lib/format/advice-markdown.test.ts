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

  it("reads bold that starts at the second character", () => {
    expect(parseInline("a**b**")).toEqual([plain("a"), bold("b")]);
  });

  it("drops an empty bold span", () => {
    expect(parseInline("a****b")).toEqual([plain("a"), plain("b")]);
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

  it("handles old Mac line endings, a lone carriage return", () => {
    expect(parseAdviceMarkdown("- a\r- b")).toEqual([
      { type: "list", ordered: false, items: [[plain("a")], [plain("b")]] },
    ]);
  });

  describe("markers only count at the start of a line", () => {
    it.each([
      ["a dash in a sentence", "Dziś - słonecznie"],
      ["a hyphen glued to a word", "well- known"],
      ["a year followed by a full stop", "Zużycie w 2026. roku było niskie."],
      ["a number glued to a word", "Faza2. Start"],
      ["a hash in a sentence", "Hasztag # w tekście"],
      ["a hash glued to a word", "abc# Tytuł"],
    ])("leaves %s as a paragraph", (_name, text) => {
      expect(parseAdviceMarkdown(text)).toEqual([{ type: "paragraph", lines: [[plain(text)]] }]);
    });
  });

  describe("markers followed by several spaces", () => {
    it.each([
      ["a bullet", "-   a", { type: "list", ordered: false, items: [[plain("a")]] }],
      ["a numbered item", "1.   a", { type: "list", ordered: true, items: [[plain("a")]] }],
      ["a heading", "#   a", { type: "paragraph", lines: [[bold("a")]] }],
    ])("trims the spaces after %s", (_name, text, block) => {
      expect(parseAdviceMarkdown(text)).toEqual([block]);
    });
  });

  it("reads multi-digit numbered items", () => {
    expect(parseAdviceMarkdown("10. dziesiąty\n11. jedenasty")).toEqual([
      { type: "list", ordered: true, items: [[plain("dziesiąty")], [plain("jedenasty")]] },
    ]);
  });

  it("ends the paragraph before a heading and keeps the order", () => {
    expect(parseAdviceMarkdown("Tekst\n# Tytuł")).toEqual([
      { type: "paragraph", lines: [[plain("Tekst")]] },
      { type: "paragraph", lines: [[bold("Tytuł")]] },
    ]);
  });

  it("strips bold markers inside a heading", () => {
    expect(parseAdviceMarkdown("# **Tytuł**")).toEqual([{ type: "paragraph", lines: [[bold("Tytuł")]] }]);
  });

  it("trims indentation from paragraph lines", () => {
    expect(parseAdviceMarkdown("   Tekst")).toEqual([{ type: "paragraph", lines: [[plain("Tekst")]] }]);
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
      ["an intro and a list with CRLF line ends", "Zalecenia:\r\n- a\r\n- b\r\n\r\nKoniec.", "pl", "p"],
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

  it("does not throw when a colon intro is the last block", () => {
    expect(shape("Zalecenia:")).toEqual({ lead: "p", rest: "" });
    expect(shape("# Dziś\n\nZalecenia:")).toEqual({ lead: "hp", rest: "" });
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

  it("does not call a bold line followed by plain text a heading", () => {
    const [mixed] = parseAdviceMarkdown("**Dziś** reszta zdania");
    expect(isHeadingBlock(mixed)).toBe(false);
  });

  it("does not call a multi-line paragraph an intro, even when its first line ends in a colon", () => {
    const [multi] = parseAdviceMarkdown("Zalecenia:\nDruga linia");
    expect(endsWithColonIntro(multi)).toBe(false);
  });

  it("ignores trailing spaces inside a bold intro", () => {
    const [intro] = parseAdviceMarkdown("**Zalecenia: **");
    expect(endsWithColonIntro(intro)).toBe(true);
  });
});
