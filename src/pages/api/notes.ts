import type { APIRoute } from "astro";
import { warsawParts } from "@/lib/format/warsaw-time";
import { SIGNIN_PATH } from "@/lib/services/magic-link";
import { handleNotePost } from "@/lib/services/day-notes";
import { createClient } from "@/lib/supabase";

export const prerender = false;

// The owner's day notes (S-19): the only write a signed-in user makes. Cookie-authenticated, so it stays behind the
// middleware's Origin check (never add it to TOKEN_AUTH_ROUTES), and it checks the session itself because
// PROTECTED_ROUTES covers pages only. Every answer is a 303, so the browser comes back to the day with a GET.
const NOT_CONFIGURED = { error: { message: "Supabase is not configured" } };

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect(SIGNIN_PATH, 303);

  const supabase = createClient(context.request.headers, context.cookies);
  const notes = () => supabase?.from("day_notes");

  const { redirect } = await handleNotePost(await context.request.formData(), {
    today: warsawParts(new Date()).dayKey,
    // One note per day. The client may not set user_id (the database defaults it to auth.uid()) and may update only
    // `text`, so an upsert can't target (user_id, day): change the day's note, and add it when there was none. A
    // concurrent add of the same day loses on unique (user_id, day) and is retried as a change. No .select(): the
    // client can't read id or user_id, so writes return no rows.
    save: async (day, text) => {
      const table = notes();
      if (table === undefined) return NOT_CONFIGURED;
      const change = async () => await table.update({ text }, { count: "exact" }).eq("day", day);
      const changed = await change();
      if (changed.error || (changed.count ?? 0) > 0) return { error: changed.error };
      const added = await table.insert({ day, text });
      return added.error?.code === "23505" ? { error: (await change()).error } : { error: added.error };
    },
    // Deleting a day without a note is still "deleted": a second submit of the same form is harmless.
    remove: async (day) => {
      const table = notes();
      if (table === undefined) return NOT_CONFIGURED;
      return { error: (await table.delete().eq("day", day)).error };
    },
    logError: (message, detail) => {
      // eslint-disable-next-line no-console -- server-side reason; the page shows a generic notice
      console.error(message, detail);
    },
  });
  return context.redirect(redirect, 303);
};
