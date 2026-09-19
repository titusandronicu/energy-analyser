import type { APIRoute } from "astro";
import { firstValidationError, signUpSchema } from "@/lib/auth-validation";
import { createClient } from "@/lib/supabase";
import { isSignupEnabled } from "@/lib/signup";

export const POST: APIRoute = async (context) => {
  if (!isSignupEnabled()) {
    return new Response("Not Found", { status: 404 });
  }

  const form = await context.request.formData();
  const credentials = signUpSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });

  if (!credentials.success) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(firstValidationError(credentials.error))}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { error } = await supabase.auth.signUp(credentials.data);

  if (error) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/auth/confirm-email");
};
