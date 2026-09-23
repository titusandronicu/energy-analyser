import { z } from "zod";

// Sign-in is an emailed one-time link (the PRD's "access key"). The link in the email template points at
// /auth/confirm with a token hash, so it works on any device, not only in the browser that requested it.

export const SIGNIN_PATH = "/auth/signin";
export const CHECK_EMAIL_PATH = "/auth/check-email";
export const AFTER_SIGNIN_PATH = "/dashboard";

export const MESSAGES = {
  invalidEmail: "Podaj poprawny adres e-mail",
  invalidLink: "Ten link do logowania jest nieprawidłowy. Poproś o nowy.",
  expiredLink: "Ten link do logowania wygasł albo został już użyty. Poproś o nowy.",
} as const;

const emailSchema = z.email(MESSAGES.invalidEmail);

interface AuthError {
  message: string;
}

export interface RequestMagicLinkDeps {
  sendOtp: (email: string, options: { shouldCreateUser: boolean }) => PromiseLike<{ error: AuthError | null }>;
  signupEnabled: boolean;
  logError?: (message: string, detail: unknown) => void;
}

export interface ConfirmMagicLinkDeps {
  verifyOtp: (params: { token_hash: string; type: "email" }) => PromiseLike<{ error: AuthError | null }>;
  logError?: (message: string, detail: unknown) => void;
}

function signinError(message: string) {
  return `${SIGNIN_PATH}?error=${encodeURIComponent(message)}`;
}

// Always ends on the check-email page after validation, so nobody can probe which addresses have accounts.
export async function requestMagicLink(form: FormData, deps: RequestMagicLinkDeps): Promise<{ redirect: string }> {
  const raw = form.get("email");
  const email = emailSchema.safeParse(typeof raw === "string" ? raw.trim() : "");
  if (!email.success) return { redirect: signinError(MESSAGES.invalidEmail) };

  const { error } = await deps.sendOtp(email.data, { shouldCreateUser: deps.signupEnabled });
  if (error) deps.logError?.("magic link request failed", error.message);
  return { redirect: CHECK_EMAIL_PATH };
}

// Any `next` parameter is ignored: confirmation always lands on the dashboard, so the link can't redirect elsewhere.
export async function confirmMagicLink(url: URL, deps: ConfirmMagicLinkDeps): Promise<{ redirect: string }> {
  const tokenHash = url.searchParams.get("token_hash")?.trim();
  if (!tokenHash || url.searchParams.get("type") !== "email") return { redirect: signinError(MESSAGES.invalidLink) };

  const { error } = await deps.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error) {
    deps.logError?.("magic link verification failed", error.message);
    return { redirect: signinError(MESSAGES.expiredLink) };
  }
  return { redirect: AFTER_SIGNIN_PATH };
}
