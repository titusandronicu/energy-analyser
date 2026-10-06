import type { APIRoute } from "astro";
import { SIGNIN_PATH } from "@/lib/services/magic-link";
import { alertRedirect, handleAlertPost } from "@/lib/services/alert-rules";
import { createClient } from "@/lib/supabase";

export const prerender = false;

// The owner's alert rules: the second write a signed-in user makes. Cookie-authenticated, so it stays behind the
// middleware's Origin check (never add it to TOKEN_AUTH_ROUTES), and it checks the session itself because
// PROTECTED_ROUTES covers pages only. Every answer is a 303, so the browser comes back to /dashboard/alerts with a GET.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect(SIGNIN_PATH, 303);

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return context.redirect(alertRedirect("invalid").redirect, 303);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    context.locals.log.error("alert rule post failed", { reason: "supabase_not_configured" });
    return context.redirect(alertRedirect("failed").redirect, 303);
  }

  // No .select() on the writes: they return no rows. Changing or deleting a missing id changes nothing and is not an
  // error. The client can write only kind (on insert), threshold, label, enabled and renotify_hours; the database
  // owns user_id and the evaluator's state.
  const { redirect } = await handleAlertPost(form, {
    create: async (rule) => await supabase.from("alert_rules").insert({ ...rule, enabled: true }),
    update: async (id, changes) => await supabase.from("alert_rules").update(changes).eq("id", id),
    setEnabled: async (id, enabled) => await supabase.from("alert_rules").update({ enabled }).eq("id", id),
    remove: async (id) => await supabase.from("alert_rules").delete().eq("id", id),
    logError: (message, detail) => {
      context.locals.log.error(message, { err: detail });
    },
  });
  return context.redirect(redirect, 303);
};
