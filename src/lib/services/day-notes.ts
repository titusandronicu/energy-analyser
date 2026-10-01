import { z } from "zod";
import { HISTORY_PATH, periodHref } from "@/lib/calendar/nav";
import { parsePeriod } from "@/lib/calendar/period";

// Day notes (S-19): the owner's one note per calendar day, posted from the history day view to /api/notes. This
// service turns the posted form into exactly one database call and the redirect back to the day, so the route stays a
// few lines. The database enforces the same text rules (supabase/migrations/*_day_notes.sql).

export const NOTE_MAX_LENGTH = 500;

export type NoteOutcome = "saved" | "deleted" | "invalid" | "failed";

// What the day view shows after a post, read back from `?note=`.
export const NOTE_NOTICES: Record<NoteOutcome, string> = {
  saved: "Notatka zapisana.",
  deleted: "Notatka usunięta.",
  invalid: "Notatka jest pusta albo dłuższa niż 500 znaków.",
  failed: "Nie udało się zapisać notatki. Spróbuj ponownie.",
};

export type NoteForm = { intent: "save"; day: string; text: string } | { intent: "delete"; day: string };

interface DbError {
  message: string;
}

export interface NotePostDeps {
  // The Europe/Warsaw day key of now; the last day a note may be written on.
  today: string;
  // Wrappers over the Supabase writes, scoped by RLS to the signed-in owner's own rows.
  save: (day: string, text: string) => PromiseLike<{ error: DbError | null }>;
  remove: (day: string) => PromiseLike<{ error: DbError | null }>;
  logError?: (message: string, detail: unknown) => void;
}

function field(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

// The day's history link when `value` is a real day key the calendar can open (2026-07-16 through today), else null.
// parsePeriod applies the same pattern, round trip and bounds as the page's own URL.
function dayHref(value: string | undefined, today: string): string | null {
  if (value === undefined) return null;
  const period = parsePeriod(new URLSearchParams({ day: value }), today);
  return period === null || period === "default" ? null : periodHref(period, today);
}

// The posted form, or "invalid": a day the calendar can open, an intent, and for "save" the trimmed text of 1 to
// NOTE_MAX_LENGTH characters. A delete ignores any text.
export function parseNoteForm(form: FormData, today: string): NoteForm | "invalid" {
  const day = z.string().refine((value) => dayHref(value, today) !== null);
  const schema = z.discriminatedUnion("intent", [
    z.object({ intent: z.literal("save"), day, text: z.string().trim().min(1).max(NOTE_MAX_LENGTH) }),
    z.object({ intent: z.literal("delete"), day }),
  ]);
  const parsed = schema.safeParse({
    intent: field(form, "intent"),
    day: field(form, "day"),
    text: field(form, "text"),
  });
  return parsed.success ? parsed.data : "invalid";
}

function outcomeRedirect(href: string | null, outcome: NoteOutcome): { redirect: string } {
  return { redirect: href === null ? `${HISTORY_PATH}?note=${outcome}` : `${href}&note=${outcome}` };
}

// Back to the day with ?note=saved|deleted|invalid|failed; to the calendar's default view when the day itself
// cannot be opened. A second save or delete of the same day is harmless, so the form needs no double-submit guard.
export async function handleNotePost(form: FormData, deps: NotePostDeps): Promise<{ redirect: string }> {
  const parsed = parseNoteForm(form, deps.today);
  if (parsed === "invalid") return outcomeRedirect(dayHref(field(form, "day"), deps.today), "invalid");

  const href = dayHref(parsed.day, deps.today);
  try {
    const { error } =
      parsed.intent === "save" ? await deps.save(parsed.day, parsed.text) : await deps.remove(parsed.day);
    if (error) {
      deps.logError?.(`day note ${parsed.intent} failed`, error.message);
      return outcomeRedirect(href, "failed");
    }
  } catch (cause) {
    deps.logError?.(`day note ${parsed.intent} failed`, cause);
    return outcomeRedirect(href, "failed");
  }
  return outcomeRedirect(href, parsed.intent === "save" ? "saved" : "deleted");
}

// The notice for a `?note=` value, or null for none or an unknown value.
export function noteNotice(param: string | null): { tone: "good" | "problem"; text: string } | null {
  if (param === null || !Object.hasOwn(NOTE_NOTICES, param)) return null;
  const outcome = param as NoteOutcome;
  return { tone: outcome === "saved" || outcome === "deleted" ? "good" : "problem", text: NOTE_NOTICES[outcome] };
}
