import { describe, expect, it } from "vitest";
import { parseAdviceMarkdown, parseInline } from "./advice-markdown";

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
