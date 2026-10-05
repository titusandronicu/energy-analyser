import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { warsawParts } from "@/lib/format/warsaw-time";
import { parseNoteForm, saveNote } from "@/lib/services/day-notes";
import { freshDays } from "./support/keys";
import { ownerClient, requireStack } from "./support/stack";

// Risk #7: the notes limits at the database next to the documented rule (form maxlength, then parseNoteForm). The
// database check is `char_length(text) <= 500 and btrim(text) <> ''` (20261001072438_day_notes.sql). Two differences
// between the layers are pinned by tests whose names start with "KNOWN GAP": the database's btrim strips only spaces
// (here), and the server trims before it counts (a unit test in src/lib/services/day-notes.test.ts, because it concerns
// the server only). Emoji are not a gap: the server and the database both count code points. All text is synthetic.
// Each case owns a far-past day (see keys.ts), so it never meets another test's row, and removes its row afterwards.

type Owner = Awaited<ReturnType<typeof ownerClient>>;

// parseNoteForm accepts only days from 2026-07-16 through today, so cases that run text through it use this one.
const PARSE_DAY = "2026-09-14";
const CHECK_VIOLATION = "23514";

function noteForm(fields: { day: string; text: string }): FormData {
  const data = new FormData();
  data.set("intent", "save");
  data.set("day", fields.day);
  data.set("text", fields.text);
  return data;
}

describe("notes parity: the database check against the documented rule", () => {
  let owner: Owner;
  let days: string[];
  let nextDay = 0;
  // Every day a case wrote or tried to write, so the cleanup removes whatever a wrong assumption left behind.
  const used: string[] = [];
  const today = warsawParts(new Date()).dayKey;

  beforeAll(async () => {
    requireStack();
    owner = await ownerClient();
    // One day per case; the owner is a fresh user, so even a reused far-past day holds no other note.
    days = await freshDays(owner, 12);
  });

  afterAll(async () => {
    for (const day of used) {
      const { error } = await owner.from("day_notes").delete({ count: "exact" }).eq("day", day);
      if (error) throw new Error(`removing the note of ${day} failed: ${error.message}`);
    }
  });

  function takeDay(): string {
    const day = days[nextDay++];
    used.push(day);
    return day;
  }

  // Same call shape as the app (src/pages/api/notes.ts): no .select(), because clients cannot read user_id, so a RETURNING
  // read of the row is refused even for the owner.
  async function insertNote(day: string, text: string) {
    return await owner.from("day_notes").insert({ day, text });
  }

  async function storedTexts(day: string): Promise<string[]> {
    const { data, error } = await owner
      .from("day_notes")
      .select("day, text")
      .eq("day", day)
      .overrideTypes<Record<string, unknown>[], { merge: false }>();
    expect(error).toBeNull();
    return (data ?? []).map((row) => String(row.text));
  }

  it("accepts exactly 500 characters", async () => {
    const day = takeDay();
    const text = "x".repeat(500);
    expect((await insertNote(day, text)).error).toBeNull();
    expect(await storedTexts(day)).toEqual([text]);
  });

  it("refuses 501 characters and stores nothing", async () => {
    const day = takeDay();
    const { error } = await insertNote(day, "x".repeat(501));
    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(await storedTexts(day)).toEqual([]);
  });

  it.each([
    { kind: "empty", text: "" },
    { kind: "spaces-only", text: "     " },
  ])("refuses an $kind text and stores nothing", async ({ text }) => {
    const day = takeDay();
    const { error } = await insertNote(day, text);
    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(await storedTexts(day)).toEqual([]);
  });

  // The database and the server agree on astral characters: both count code points (char_length; zod 4's max), so 500
  // emoji are exactly the maximum for both although they are 1000 UTF-16 units. Only the textarea's maxlength counts
  // UTF-16 units and stops at 250 emoji, which is stricter and harmless. (The research assumed zod counted UTF-16 units;
  // a run showed it does not, so there is no gap here.)
  it("accepts 500 emoji at the server and the database alike", async () => {
    const day = takeDay();
    const text = "😀".repeat(500);
    expect(text).toHaveLength(1000);

    expect(parseNoteForm(noteForm({ day: PARSE_DAY, text }), today)).toEqual({
      intent: "save",
      day: PARSE_DAY,
      text,
    });

    expect((await insertNote(day, text)).error).toBeNull();
    expect(await storedTexts(day)).toEqual([text]);
  });

  it("refuses 501 emoji, the database limit being 500 code points", async () => {
    const day = takeDay();
    const { error } = await insertNote(day, "😀".repeat(501));
    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(await storedTexts(day)).toEqual([]);
  });

  // KNOWN GAP: `btrim(text)` with no second argument strips spaces only, so a text of tabs or line breaks passes the
  // database check, while the server's trim() strips all whitespace and refuses it. The database is looser. A fix is a
  // whitespace regex in the check (for example `text !~ '^\s*$'`), which would make this insert fail. (Postgres semantics
  // are documented, not yet confirmed by a run: if this test fails, the first expectation names what btrim did.)
  it.each([
    { kind: "tab-only", text: "\t\t\t" },
    { kind: "newline-only", text: "\n\n" },
  ])("KNOWN GAP: the database accepts a $kind text that the server refuses", async ({ text }) => {
    const day = takeDay();

    // The documented rule: only whitespace is blank.
    expect(parseNoteForm(noteForm({ day: PARSE_DAY, text }), today)).toBe("invalid");

    // The database: not equal to '' after btrim of spaces, so it is stored.
    expect((await insertNote(day, text)).error).toBeNull();
    expect(await storedTexts(day)).toEqual([text]);
  });

  it("saves through the real saveNote the LF-normalised text of a form posted with CRLF line breaks", async () => {
    // The form's day must be one the calendar can open (2026-07-16 through today), unlike the far-past days above; the
    // owner is a fresh user, so this day holds no note of anybody else's.
    used.push(PARSE_DAY);
    const posted = "first line\r\nsecond line\r\n\r\nfourth line";
    const parsed = parseNoteForm(noteForm({ day: PARSE_DAY, text: posted }), today);
    if (parsed === "invalid" || parsed.intent !== "save")
      throw new Error("the synthetic note was not parsed as a save");
    expect(parsed.text).toBe("first line\nsecond line\n\nfourth line");

    const { error } = await saveNote(parsed.day, parsed.text, {
      update: async (d, t) => await owner.from("day_notes").update({ text: t }, { count: "exact" }).eq("day", d),
      insert: async (d, t) => await owner.from("day_notes").insert({ day: d, text: t }),
    });
    expect(error).toBeNull();

    const stored = await storedTexts(PARSE_DAY);
    expect(stored).toEqual(["first line\nsecond line\n\nfourth line"]);
    expect(stored[0]).not.toContain("\r");
  });
});
