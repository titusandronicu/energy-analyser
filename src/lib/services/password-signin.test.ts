import { describe, expect, it, vi } from "vitest";
import { PASSWORD_MESSAGES, signInWithPassword, type PasswordSignInDeps } from "./password-signin";

function form(fields: Partial<Record<"email" | "password", string>>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function deps(error: { message: string } | null = null) {
  return { signIn: vi.fn<PasswordSignInDeps["signIn"]>(() => Promise.resolve({ error })), logError: vi.fn() };
}

const signinError = (message: string) => `/auth/signin?error=${encodeURIComponent(message)}&method=password`;

describe("signInWithPassword", () => {
  it("signs in with trimmed email and the exact password, then lands on the dashboard", async () => {
    const d = deps();
    expect(await signInWithPassword(form({ email: " owner@example.com ", password: " pw " }), d)).toEqual({
      redirect: "/dashboard",
    });
    expect(d.signIn).toHaveBeenCalledWith({ email: "owner@example.com", password: " pw " });
  });

  it.each<Partial<Record<"email" | "password", string>>>([
    {},
    { email: "owner@example.com" },
    { email: "not-an-email", password: "pw" },
    { password: "pw" },
  ])("asks for both fields without calling Supabase (%j)", async (fields) => {
    const d = deps();
    expect(await signInWithPassword(form(fields), d)).toEqual({ redirect: signinError(PASSWORD_MESSAGES.missing) });
    expect(d.signIn).not.toHaveBeenCalled();
  });

  it("shows one generic message for any rejection and logs the reason", async () => {
    const d = deps({ message: "Invalid login credentials" });
    expect(await signInWithPassword(form({ email: "owner@example.com", password: "wrong" }), d)).toEqual({
      redirect: signinError(PASSWORD_MESSAGES.rejected),
    });
    expect(d.logError).toHaveBeenCalledWith("password sign-in failed", "Invalid login credentials");
  });
});
