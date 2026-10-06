import { describe, expect, it } from "vitest";
import { classifyAuthError, decideAuth, unavailableResponse } from "./auth-outage";

const owner = { id: "owner" };
const sessionMissing = { name: "AuthSessionMissingError", status: 400 };
const networkDown = { name: "AuthRetryableFetchError", status: 0 };

describe("classifyAuthError", () => {
  it.each([
    ["no error", null, null],
    ["a missing session", sessionMissing, "session-missing"],
    ["a network failure (status 0)", networkDown, "outage"],
    ["a retryable fetch error on a 503", { name: "AuthRetryableFetchError", status: 503 }, "outage"],
    ["an API error with status 500", { name: "AuthApiError", status: 500 }, "outage"],
    ["an API error with status 502", { name: "AuthApiError", status: 502 }, "outage"],
    ["rate limiting (429)", { name: "AuthApiError", status: 429 }, "outage"],
    ["an invalid token (401)", { name: "AuthApiError", status: 401 }, "other"],
    ["a forbidden token (403)", { name: "AuthApiError", status: 403 }, "other"],
    ["a bad request (400)", { name: "AuthApiError", status: 400 }, "other"],
    ["an unknown error with no status", { name: "Weird" }, "other"],
  ])("reads %s", (_name, error, kind) => {
    expect(classifyAuthError(error)).toBe(kind);
  });

  it("treats the boundary statuses correctly", () => {
    expect(classifyAuthError({ status: 499 })).toBe("other");
    expect(classifyAuthError({ status: 500 })).toBe("outage");
    expect(classifyAuthError({ status: 428 })).toBe("other");
    expect(classifyAuthError({ status: 429 })).toBe("outage");
  });
});

describe("decideAuth during an outage", () => {
  it.each([
    ["GET", "/"],
    ["GET", "/dashboard"],
    ["GET", "/dashboard/history"],
    ["GET", "/dashboard/alerts"],
    ["POST", "/api/notes"],
    ["POST", "/api/alert-rules"],
  ])("refuses %s %s with the 503 and logs the outage", (method, pathname) => {
    expect(decideAuth({ pathname, method, user: null, error: networkDown })).toEqual({
      action: "unavailable",
      logEvent: "auth_unavailable",
    });
  });

  it.each([
    ["GET", "/auth/signin"],
    ["GET", "/auth/confirm"],
    ["POST", "/api/auth/signin"],
    ["POST", "/api/auth/magic-link"],
    ["POST", "/api/auth/signout"],
    ["GET", "/api/health"],
    ["GET", "/api/notes"],
    ["GET", "/api/alert-rules"],
  ])("lets %s %s continue as anonymous but still logs the outage", (method, pathname) => {
    expect(decideAuth({ pathname, method, user: null, error: networkDown })).toEqual({
      action: "continue",
      logEvent: "auth_unavailable",
    });
  });
});

describe("decideAuth without an outage", () => {
  it("redirects a signed-out visitor away from the dashboard, silently", () => {
    for (const error of [null, sessionMissing, { name: "AuthApiError", status: 401 }]) {
      expect(decideAuth({ pathname: "/dashboard", method: "GET", user: null, error })).toEqual({
        action: "redirect-signin",
        logEvent: null,
      });
      expect(decideAuth({ pathname: "/dashboard/history", method: "GET", user: null, error }).action).toBe(
        "redirect-signin",
      );
    }
  });

  it("lets a signed-out visitor reach the home page and the sign-in routes, silently", () => {
    for (const pathname of ["/", "/auth/signin", "/api/auth/signin"]) {
      expect(decideAuth({ pathname, method: "GET", user: null, error: sessionMissing })).toEqual({
        action: "continue",
        logEvent: null,
      });
    }
  });

  it("lets a signed-in owner through everywhere", () => {
    for (const pathname of [
      "/",
      "/dashboard",
      "/dashboard/history",
      "/dashboard/alerts",
      "/api/notes",
      "/api/alert-rules",
    ]) {
      expect(decideAuth({ pathname, method: "POST", user: owner, error: null })).toEqual({
        action: "continue",
        logEvent: null,
      });
    }
  });

  it("never logs a missing session or an expired token", () => {
    expect(decideAuth({ pathname: "/", method: "GET", user: null, error: sessionMissing }).logEvent).toBeNull();
    expect(
      decideAuth({ pathname: "/", method: "GET", user: null, error: { name: "AuthApiError", status: 401 } }).logEvent,
    ).toBeNull();
  });
});

describe("unavailableResponse", () => {
  it("is a 503 that must not be cached, with a retry hint and the request id in a header", () => {
    const res = unavailableResponse("req-12345678");
    expect(res.status).toBe(503);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(res.headers.get("X-Request-Id")).toBe("req-12345678");
  });

  it("says in Polish that sign-in is unavailable and shows the request id", async () => {
    const body = await unavailableResponse("req-12345678").text();
    expect(body).toContain("Logowanie jest chwilowo niedostępne");
    expect(body).toContain("Spróbuj ponownie za chwilę");
    expect(body).toContain("<code>req-12345678</code>");
  });

  it("escapes the request id", async () => {
    const body = await unavailableResponse(`<b>"x"</b>&'`).text();
    expect(body).toContain("&#60;b&#62;&#34;x&#34;&#60;/b&#62;&#38;&#39;");
    expect(body).not.toContain("<b>");
  });
});
