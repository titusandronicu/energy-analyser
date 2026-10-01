import { describe, expect, it, vi } from "vitest";
import {
  handleNotePost,
  NOTE_MAX_LENGTH,
  NOTE_NOTICES,
  noteNotice,
  parseNoteForm,
  type NotePostDeps,
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

  it.each([" \n\t ", ""])("rejects blank text on save (%j)", (text) => {
    expect(parseNoteForm(form({ day: "2026-09-14", intent: "save", text }), TODAY)).toBe("invalid");
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
    expect(d.logError).toHaveBeenCalledWith("day note save failed", "synthetic database error");
  });

  it("logs a database error and reports the delete as failed", async () => {
    const d = deps({ message: "synthetic database error" });
    expect(await handleNotePost(form({ day: "2026-09-14", intent: "delete" }), d)).toEqual({
      redirect: dayRedirect("2026-09-14", "failed"),
    });
    expect(d.logError).toHaveBeenCalledWith("day note delete failed", "synthetic database error");
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
