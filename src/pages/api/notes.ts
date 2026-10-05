import type { APIRoute } from "astro";
import { warsawParts } from "@/lib/format/warsaw-time";
import { SIGNIN_PATH } from "@/lib/services/magic-link";
import { handleNotePost, noteRedirect, saveNote } from "@/lib/services/day-notes";
import { createClient } from "@/lib/supabase";

export const prerender = false;

// The owner's day notes (S-19): the only write a signed-in user makes. Cookie-authenticated, so it stays behind the
// middleware's Origin check (never add it to TOKEN_AUTH_ROUTES), and it checks the session itself because
// PROTECTED_ROUTES covers pages only. Every answer is a 303, so the browser comes back to the day with a GET.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect(SIGNIN_PATH, 303);

  const today = warsawParts(new Date()).dayKey;
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    // Not a form body: there is no day to go back to, so back to the calendar.
    return context.redirect(noteRedirect(undefined, today, "invalid").redirect, 303);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    context.locals.log.error("day note post failed", { reason: "supabase_not_configured" });
    const day = form.get("day");
    return context.redirect(noteRedirect(typeof day === "string" ? day : undefined, today, "failed").redirect, 303);
  }

  const { redirect } = await handleNotePost(form, {
    today,
    // saveNote does update-then-insert (see there). No .select() on the writes: the client can't read id or user_id,
    // so they return no rows.
    save: (day, text) =>
      saveNote(day, text, {
        update: async (d, t) => await supabase.from("day_notes").update({ text: t }, { count: "exact" }).eq("day", d),
        insert: async (d, t) => await supabase.from("day_notes").insert({ day: d, text: t }),
      }),
    // Deleting a day without a note is still "deleted": a second submit of the same form is harmless.
    remove: async (day) => await supabase.from("day_notes").delete().eq("day", day),
    logError: (message, detail) => {
      context.locals.log.error(message, { err: detail });
    },
  });
  return context.redirect(redirect, 303);
};
