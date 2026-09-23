import { z } from "zod";
import { AFTER_SIGNIN_PATH, SIGNIN_PATH } from "@/lib/services/magic-link";

// Password sign-in is the alternative to the emailed link (restored 2026-09-23 at the owner's request).
// There is still no sign-up form: only existing accounts can sign in.

export const PASSWORD_MESSAGES = {
  missing: "Podaj adres e-mail i hasło",
  rejected: "Nieprawidłowy e-mail lub hasło",
} as const;

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export interface PasswordSignInDeps {
  signIn: (credentials: { email: string; password: string }) => PromiseLike<{ error: { message: string } | null }>;
  logError?: (message: string, detail: unknown) => void;
}

function signinError(message: string) {
  return `${SIGNIN_PATH}?error=${encodeURIComponent(message)}&method=password`;
}

// Every failure from Supabase maps to the same message, so the form never reveals whether an account exists.
export async function signInWithPassword(form: FormData, deps: PasswordSignInDeps): Promise<{ redirect: string }> {
  const email = form.get("email");
  const password = form.get("password");
  const credentials = credentialsSchema.safeParse({
    email: typeof email === "string" ? email.trim() : "",
    password: typeof password === "string" ? password : "",
  });
  if (!credentials.success) return { redirect: signinError(PASSWORD_MESSAGES.missing) };

  const { error } = await deps.signIn(credentials.data);
  if (error) {
    deps.logError?.("password sign-in failed", error.message);
    return { redirect: signinError(PASSWORD_MESSAGES.rejected) };
  }
  return { redirect: AFTER_SIGNIN_PATH };
}
