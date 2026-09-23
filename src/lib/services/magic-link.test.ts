import { describe, expect, it, vi } from "vitest";
import {
  confirmMagicLink,
  MESSAGES,
  requestMagicLink,
  type ConfirmMagicLinkDeps,
  type RequestMagicLinkDeps,
} from "./magic-link";

function form(email?: string) {
  const data = new FormData();
  if (email !== undefined) data.set("email", email);
  return data;
}

function requestDeps(error: { message: string } | null = null, signupEnabled = false) {
  return {
    sendOtp: vi.fn<RequestMagicLinkDeps["sendOtp"]>(() => Promise.resolve({ error })),
    signupEnabled,
    logError: vi.fn(),
  };
}

function confirmDeps(error: { message: string } | null = null) {
  return {
    verifyOtp: vi.fn<ConfirmMagicLinkDeps["verifyOtp"]>(() => Promise.resolve({ error })),
    exchangeCode: vi.fn<ConfirmMagicLinkDeps["exchangeCode"]>(() => Promise.resolve({ error })),
    logError: vi.fn(),
  };
}

const signinError = (message: string) => `/auth/signin?error=${encodeURIComponent(message)}`;

describe("requestMagicLink", () => {
  it.each([undefined, "", "not-an-email"])("rejects %j without sending anything", async (email) => {
    const deps = requestDeps();
    expect(await requestMagicLink(form(email), deps)).toEqual({ redirect: signinError(MESSAGES.invalidEmail) });
    expect(deps.sendOtp).not.toHaveBeenCalled();
  });

  it("sends a link to the trimmed address and goes to check-email", async () => {
    const deps = requestDeps();
    expect(await requestMagicLink(form("  owner@example.com "), deps)).toEqual({ redirect: "/auth/check-email" });
    expect(deps.sendOtp).toHaveBeenCalledWith("owner@example.com", { shouldCreateUser: false });
  });

  it("lets the request create a user only when signup is enabled", async () => {
    const deps = requestDeps(null, true);
    await requestMagicLink(form("new@example.com"), deps);
    expect(deps.sendOtp).toHaveBeenCalledWith("new@example.com", { shouldCreateUser: true });
  });

  it("still goes to check-email when Supabase rejects the address, and logs the reason", async () => {
    const deps = requestDeps({ message: "Signups not allowed for otp" });
    expect(await requestMagicLink(form("stranger@example.com"), deps)).toEqual({ redirect: "/auth/check-email" });
    expect(deps.logError).toHaveBeenCalledWith("magic link request failed", "Signups not allowed for otp");
  });
});

describe("confirmMagicLink", () => {
  const confirmUrl = (query: string) => new URL(`http://localhost/auth/confirm?${query}`);

  it("signs in with a valid token hash and lands on the dashboard", async () => {
    const deps = confirmDeps();
    expect(await confirmMagicLink(confirmUrl("token_hash=abc&type=email"), deps)).toEqual({ redirect: "/dashboard" });
    expect(deps.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "email" });
  });

  it.each(["type=email", "token_hash=%20&type=email", "token_hash=abc&type=recovery", "token_hash=abc"])(
    "rejects an invalid link (%s) without verifying",
    async (query) => {
      const deps = confirmDeps();
      expect(await confirmMagicLink(confirmUrl(query), deps)).toEqual({ redirect: signinError(MESSAGES.invalidLink) });
      expect(deps.verifyOtp).not.toHaveBeenCalled();
      expect(deps.exchangeCode).not.toHaveBeenCalled();
    },
  );

  it("sends an expired or reused link back to sign-in", async () => {
    const deps = confirmDeps({ message: "Email link is invalid or has expired" });
    expect(await confirmMagicLink(confirmUrl("token_hash=abc&type=email"), deps)).toEqual({
      redirect: signinError(MESSAGES.expiredLink),
    });
    expect(deps.logError).toHaveBeenCalled();
  });

  it("exchanges a PKCE code from Supabase's default email and lands on the dashboard", async () => {
    const deps = confirmDeps();
    expect(await confirmMagicLink(confirmUrl("code=pkce-code"), deps)).toEqual({ redirect: "/dashboard" });
    expect(deps.exchangeCode).toHaveBeenCalledWith("pkce-code");
    expect(deps.verifyOtp).not.toHaveBeenCalled();
  });

  it("sends a failed code exchange back to sign-in", async () => {
    const deps = confirmDeps({ message: "code verifier missing" });
    expect(await confirmMagicLink(confirmUrl("code=pkce-code"), deps)).toEqual({
      redirect: signinError(MESSAGES.expiredLink),
    });
  });

  it("prefers the token hash when both are present", async () => {
    const deps = confirmDeps();
    await confirmMagicLink(confirmUrl("token_hash=abc&type=email&code=pkce-code"), deps);
    expect(deps.verifyOtp).toHaveBeenCalled();
    expect(deps.exchangeCode).not.toHaveBeenCalled();
  });

  it("ignores a next parameter", async () => {
    const result = await confirmMagicLink(
      confirmUrl("token_hash=abc&type=email&next=https://evil.example"),
      confirmDeps(),
    );
    expect(result).toEqual({ redirect: "/dashboard" });
  });
});
