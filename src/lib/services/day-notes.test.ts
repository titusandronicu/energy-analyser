import { describe, expect, it, vi } from "vitest";
import {
  handleNotePost,
  NOTE_MAX_LENGTH,
  NOTE_NOTICES,
  noteNotice,
  noteRedirect,
  parseNoteForm,
  saveNote,
  type NotePostDeps,
  type NoteWrites,
} from "./day-notes";

// All data here is synthetic.

const TODAY = "2026-10-01";

function form(fields: Partial<Record<"day" | "intent" | "text", string>>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function deps(error: { message: string } | null = null) {
  return {
    today: TODAY,
    save: vi.fn<NotePostDeps["save"]>(() => Promise.resolve({ error })),
    remove: vi.fn<NotePostDeps["remove"]>(() => Promise.resolve({ error })),
    logError: vi.fn(),
  };
}

const dayRedirect = (day: string, outcome: string) => `/dashboard/history?day=${day}&note=${outcome}`;

describe("parseNoteForm", () => {
  it.each([
    ["2026-07-15", "invalid"],
    ["2026-07-16", "ok"],
    [TODAY, "ok"],
    ["2026-10-02", "invalid"],
  ])("accepts only openable days: %s is %s", (day, expected) => {
    const parsed = parseNoteForm(form({ day, intent: "save", text: "Synthetic note" }), TODAY);
    expect(parsed === "invalid" ? "invalid" : "ok").toBe(expected);
  });

  it.each(["2026-02-30", "2026-9-14", "", "yesterday"])("rejects a malformed day (%j)", (day) => {
    expect(parseNoteForm(form({ day, intent: "save", text: "Synthetic note" }), TODAY)).toBe("invalid");
  });

  it("trims the text and accepts exactly the maximum length", () => {
    expect(NOTE_MAX_LENGTH).toBe(500);
    const text = "x".repeat(500);
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "save", text: `  ${text}\n` }), TODAY)).toEqual({
      intent: "save",
      day: "2026-09-14",
      text,
    });
  });

  it("rejects text one character over the maximum", () => {
    const text = "x".repeat(501);
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "save", text }), TODAY)).toBe("invalid");
  });

  it("counts a CRLF line break as one character, as the textarea's maxlength does", () => {
    // 499 characters including one line break, as the browser counts them; 500 as submitted.
    const text = `${"x".repeat(249)}\r\n${"x".repeat(249)}`;
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "save", text }), TODAY)).toEqual({
      intent: "save",
      day: "2026-09-14",
      text: `${"x".repeat(249)}\n${"x".repeat(249)}`,
    });
  });

  it("accepts the maximum length with a CRLF line break (501 characters as submitted)", () => {
    const text = `${"x".repeat(250)}\r\n${"x".repeat(249)}`;
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "save", text }), TODAY)).toEqual({
      intent: "save",
      day: "2026-09-14",
      text: `${"x".repeat(250)}\n${"x".repeat(249)}`,
    });
  });

  it("rejects 500 characters plus a CRLF line break", () => {
    const text = `${"x".repeat(250)}\r\n${"x".repeat(250)}`;
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "save", text }), TODAY)).toBe("invalid");
  });

  it("normalises a lone CR to a line feed", () => {
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "save", text: "one\rtwo" }), TODAY)).toEqual({
      intent: "save",
      day: "2026-09-14",
      text: "one\ntwo",
    });
  });

  it.each([" \n\t ", ""])("rejects blank text on save (%j)", (text) => {
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "save", text }), TODAY)).toBe("invalid");
  });

  it("counts an emoji as one character (a code point), as the database does: 500 are accepted, 501 are not", () => {
    // One emoji is a surrogate pair, 2 UTF-16 units, but zod 4's max counts code points: 500 x 1 = 500, the maximum;
    // 501 is over it. (Checked by a run: zod 4.6.5 accepts 500 emoji, 1000 UTF-16 units.) The textarea's maxlength counts
    // UTF-16 units, so the browser stops at 250 emoji and is stricter than the server and the database, which agree.
    const accepted = "😀".repeat(500);
    expect(accepted).toHaveLength(1000);
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "save", text: accepted }), TODAY)).toEqual({
      intent: "save",
      day: "2026-09-14",
      text: accepted,
    });

    const refused = "😀".repeat(501);
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "save", text: refused }), TODAY)).toBe("invalid");
  });

  it("rejects a note of only tabs, non-breaking spaces and line breaks", () => {
    // trim() strips every Unicode whitespace character, not only spaces (the database's btrim strips only spaces).
    const text = "\t \n\r\n \t";
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "save", text }), TODAY)).toBe("invalid");
  });

  it("trims before it checks the maximum, so 500 characters with surrounding spaces are saved trimmed", () => {
    // 2 + 500 + 2 = 504 characters as typed; after trim 500, the maximum. The server accepts it.
    const text = "x".repeat(500);
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "save", text: `  ${text}  ` }), TODAY)).toEqual({
      intent: "save",
      day: "2026-09-14",
      text,
    });
  });

  // KNOWN GAP: the server is looser than the form. The textarea counts the surrounding spaces (504 here), so the
  // browser stops typing at 500 and never submits this; a hand-made post gets through because the server trims first.
  // A fix is to check the length before trimming, which would reject this case and flip the expectation.
  it("KNOWN GAP: the server accepts 500 characters plus surrounding spaces that the browser's maxlength would stop", () => {
    const text = "x".repeat(500);
    const typed = `${" ".repeat(10)}${text}${" ".repeat(10)}`;
    expect(typed).toHaveLength(520);
    expect(typed.length).toBeGreaterThan(NOTE_MAX_LENGTH);
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "save", text: typed }), TODAY)).toEqual({
      intent: "save",
      day: "2026-09-14",
      text,
    });
  });

  it("rejects a save without text", () => {
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "save" }), TODAY)).toBe("invalid");
  });

  it("accepts a delete without text", () => {
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "delete" }), TODAY)).toEqual({
      intent: "delete",
      day: "2026-09-14",
    });
  });

  it.each(["update", "", "SAVE"])("rejects an unknown intent (%j)", (intent) => {
    expect(parseNoteForm(form({ day: "2026-09-14", intent, text: "Synthetic note" }), TODAY)).toBe("invalid");
  });

  it("rejects a form without an intent", () => {
    expect(parseNoteForm(form({ day: "2026-09-14", text: "Synthetic note" }), TODAY)).toBe("invalid");
  });
});

describe("saveNote", () => {
  type Updated = Awaited<ReturnType<NoteWrites["update"]>>;
  type Inserted = Awaited<ReturnType<NoteWrites["insert"]>>;

  function writes(updates: Updated[], inserted: Inserted = { error: null }) {
    const queue = [...updates];
    return {
      update: vi.fn<NoteWrites["update"]>(() => Promise.resolve(queue.shift() ?? { count: 0, error: null })),
      insert: vi.fn<NoteWrites["insert"]>(() => Promise.resolve(inserted)),
    };
  }

  const duplicate = { message: "synthetic duplicate key", code: "23505" };

  it("changes the day's existing note without an insert", async () => {
    const w = writes([{ count: 1, error: null }]);
    expect(await saveNote("2026-09-14", "Synthetic note", w)).toEqual({ error: null });
    expect(w.update).toHaveBeenCalledWith("2026-09-14", "Synthetic note");
    expect(w.insert).not.toHaveBeenCalled();
  });

  it("adds the note when the day had none", async () => {
    const w = writes([{ count: 0, error: null }]);
    expect(await saveNote("2026-09-14", "Synthetic note", w)).toEqual({ error: null });
    expect(w.insert).toHaveBeenCalledWith("2026-09-14", "Synthetic note");
    expect(w.update).toHaveBeenCalledTimes(1);
  });

  it("retries a concurrent add (23505) once as a change", async () => {
    const w = writes(
      [
        { count: 0, error: null },
        { count: 1, error: null },
      ],
      { error: duplicate },
    );
    expect(await saveNote("2026-09-14", "Synthetic note", w)).toEqual({ error: null });
    expect(w.update).toHaveBeenCalledTimes(2);
  });

  it("fails when the retried change matches no row", async () => {
    const w = writes(
      [
        { count: 0, error: null },
        { count: 0, error: null },
      ],
      { error: duplicate },
    );
    const { error } = await saveNote("2026-09-14", "Synthetic note", w);
    expect(error).not.toBeNull();
    expect(w.update).toHaveBeenCalledTimes(2);
  });

  it("fails on a retried change's error", async () => {
    const retryError = { message: "synthetic retry error" };
    const w = writes(
      [
        { count: 0, error: null },
        { count: null, error: retryError },
      ],
      { error: duplicate },
    );
    expect(await saveNote("2026-09-14", "Synthetic note", w)).toEqual({ error: retryError });
  });

  it("fails on an update error without an insert", async () => {
    const updateError = { message: "synthetic update error" };
    const w = writes([{ count: null, error: updateError }]);
    expect(await saveNote("2026-09-14", "Synthetic note", w)).toEqual({ error: updateError });
    expect(w.insert).not.toHaveBeenCalled();
  });

  it("fails on any other insert error without a retry", async () => {
    const insertError = { message: "synthetic check violation", code: "23514" };
    const w = writes([{ count: 0, error: null }], { error: insertError });
    expect(await saveNote("2026-09-14", "Synthetic note", w)).toEqual({ error: insertError });
    expect(w.update).toHaveBeenCalledTimes(1);
  });

  it("reports a failed save through handleNotePost as failed", async () => {
    const w = writes(
      [
        { count: 0, error: null },
        { count: 0, error: null },
      ],
      { error: duplicate },
    );
    const d = { ...deps(), save: (day: string, text: string) => saveNote(day, text, w) };
    expect(await handleNotePost(form({ day: "2026-09-14", intent: "save", text: "Synthetic note" }), d)).toEqual({
      redirect: dayRedirect("2026-09-14", "failed"),
    });
  });
});

describe("noteRedirect", () => {
  it("goes back to an openable day", () => {
    expect(noteRedirect("2026-09-14", TODAY, "failed")).toEqual({ redirect: dayRedirect("2026-09-14", "failed") });
  });

  it.each([undefined, "2026-02-30"])("falls back to the calendar for %j", (day) => {
    expect(noteRedirect(day, TODAY, "invalid")).toEqual({ redirect: "/dashboard/history?note=invalid" });
  });
});

describe("handleNotePost", () => {
  it("saves the trimmed text and goes back to the day", async () => {
    const d = deps();
    expect(await handleNotePost(form({ day: "2026-09-14", intent: "save", text: " Synthetic note " }), d)).toEqual({
      redirect: dayRedirect("2026-09-14", "saved"),
    });
    expect(d.save).toHaveBeenCalledWith("2026-09-14", "Synthetic note");
    expect(d.remove).not.toHaveBeenCalled();
  });

  it("saves a note on today", async () => {
    const d = deps();
    expect(await handleNotePost(form({ day: TODAY, intent: "save", text: "Synthetic note" }), d)).toEqual({
      redirect: dayRedirect(TODAY, "saved"),
    });
  });

  it("deletes the day's note and goes back to the day", async () => {
    const d = deps();
    expect(await handleNotePost(form({ day: "2026-09-14", intent: "delete" }), d)).toEqual({
      redirect: dayRedirect("2026-09-14", "deleted"),
    });
    expect(d.remove).toHaveBeenCalledWith("2026-09-14");
    expect(d.save).not.toHaveBeenCalled();
  });

  it("returns to the day as invalid when only the text is wrong, without a database call", async () => {
    const d = deps();
    const text = "x".repeat(501);
    expect(await handleNotePost(form({ day: "2026-09-14", intent: "save", text }), d)).toEqual({
      redirect: dayRedirect("2026-09-14", "invalid"),
    });
    expect(d.save).not.toHaveBeenCalled();
  });

  it("returns to the day as invalid for an unknown intent", async () => {
    const d = deps();
    expect(await handleNotePost(form({ day: "2026-09-14", intent: "archive" }), d)).toEqual({
      redirect: dayRedirect("2026-09-14", "invalid"),
    });
    expect(d.save).not.toHaveBeenCalled();
    expect(d.remove).not.toHaveBeenCalled();
  });

  it.each([{ day: "2026-02-30" }, { day: "2026-07-15" }, { day: "2026-10-02" }, {}])(
    "falls back to the calendar when the day cannot be opened (%j)",
    async (fields) => {
      const d = deps();
      expect(await handleNotePost(form({ ...fields, intent: "save", text: "Synthetic note" }), d)).toEqual({
        redirect: "/dashboard/history?note=invalid",
      });
      expect(d.save).not.toHaveBeenCalled();
    },
  );

  it("logs a database error and reports the save as failed", async () => {
    const d = deps({ message: "synthetic database error" });
    expect(await handleNotePost(form({ day: "2026-09-14", intent: "save", text: "Synthetic note" }), d)).toEqual({
      redirect: dayRedirect("2026-09-14", "failed"),
    });
    expect(d.logError).toHaveBeenCalledWith(
      "day note save failed",
      expect.objectContaining({ message: "synthetic database error" }),
    );
  });

  it("logs a database error and reports the delete as failed", async () => {
    const d = deps({ message: "synthetic database error" });
    expect(await handleNotePost(form({ day: "2026-09-14", intent: "delete" }), d)).toEqual({
      redirect: dayRedirect("2026-09-14", "failed"),
    });
    expect(d.logError).toHaveBeenCalledWith(
      "day note delete failed",
      expect.objectContaining({ message: "synthetic database error" }),
    );
  });

  it("reports a thrown write as failed", async () => {
    const d = deps();
    const cause = new Error("synthetic network error");
    d.save.mockRejectedValueOnce(cause);
    expect(await handleNotePost(form({ day: "2026-09-14", intent: "save", text: "Synthetic note" }), d)).toEqual({
      redirect: dayRedirect("2026-09-14", "failed"),
    });
    expect(d.logError).toHaveBeenCalledWith("day note save failed", cause);
  });
});

describe("noteNotice", () => {
  it.each([
    ["saved", "good"],
    ["deleted", "good"],
    ["invalid", "problem"],
    ["failed", "problem"],
  ] as const)("maps %s to its %s notice", (param, tone) => {
    expect(noteNotice(param)).toEqual({ tone, text: NOTE_NOTICES[param] });
  });

  it("builds the invalid notice from NOTE_MAX_LENGTH", () => {
    expect(NOTE_NOTICES.invalid).toContain(String(NOTE_MAX_LENGTH));
  });

  it("pins the Polish copy", () => {
    expect(NOTE_NOTICES).toEqual({
      saved: "Notatka zapisana.",
      deleted: "Notatka usunięta.",
      invalid: "Notatka jest pusta albo dłuższa niż 500 znaków.",
      failed: "Nie udało się zapisać notatki. Spróbuj ponownie.",
    });
  });

  it.each([null, "", "toString", "SAVED", "other"])("shows nothing for %j", (param) => {
    expect(noteNotice(param)).toBeNull();
  });
});
