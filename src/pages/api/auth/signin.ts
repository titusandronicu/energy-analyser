import type { APIRoute } from "astro";
import { firstValidationError, signInSchema } from "@/lib/auth-validation";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const credentials = signInSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });

  if (!credentials.success) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(firstValidationError(credentials.error))}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { error } = await supabase.auth.signInWithPassword(credentials.data);

  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/");
};
