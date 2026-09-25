// A tiny, safe Markdown subset for LLM-narrated advice: paragraphs, bullet and numbered lists, headings
// (shown as bold lines) and **bold** spans. It returns structure, never HTML: the page renders every
// segment as escaped text, so model output can't inject markup.

export interface Segment {
  text: string;
  bold: boolean;
}

export type Block = { type: "paragraph"; lines: Segment[][] } | { type: "list"; ordered: boolean; items: Segment[][] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

// Splits `**bold**` spans; an unmatched `**` stays literal text.
export function parseInline(line: string): Segment[] {
  const segments: Segment[] = [];
  let rest = line;
  for (;;) {
    const start = rest.indexOf("**");
    const end = start === -1 ? -1 : rest.indexOf("**", start + 2);
    if (start === -1 || end === -1) break;
    if (start > 0) segments.push({ text: rest.slice(0, start), bold: false });
    const inner = rest.slice(start + 2, end);
    if (inner) segments.push({ text: inner, bold: true });
    rest = rest.slice(end + 2);
  }
  if (rest) segments.push({ text: rest, bold: false });
  return segments;
}

export function parseAdviceMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  // Declared with `as` so TypeScript doesn't narrow them to null; flush() reassigns them.
  let paragraph = null as Segment[][] | null;
  let list = null as { ordered: boolean; items: Segment[][] } | null;

  const flush = () => {
    if (paragraph) blocks.push({ type: "paragraph", lines: paragraph });
    if (list) blocks.push({ type: "list", ...list });
    paragraph = null;
    list = null;
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      const ordered = numbered !== null;
      if (list?.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(parseInline(item[1]));
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "paragraph", lines: [[{ text: heading[1].replace(/\*\*/g, ""), bold: true }]] });
      continue;
    }

    if (list) flush();
    paragraph ??= [];
    paragraph.push(parseInline(line.trim()));
  }
  flush();
  return blocks;
}
