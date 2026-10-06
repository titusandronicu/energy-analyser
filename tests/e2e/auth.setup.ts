import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { expect, test as setup } from "@playwright/test";
import { requireStackEnv } from "./support/env";

const AUTH_DIR = "tests/e2e/.auth";
const STORAGE_STATE = `${AUTH_DIR}/owner.json`;
const EMAIL_FILE = `${AUTH_DIR}/owner-email.txt`;

// One fresh owner per run, signed in through the app's own route (not the sign-in form, whose React islands would make
// every test depend on hydration timing). The seed trigger of the local stack makes every new user an owner.
setup("sign in as a fresh owner", async ({ request, baseURL }) => {
  if (baseURL === undefined) throw new Error("The Playwright config must set use.baseURL.");
  const { url, anonKey } = requireStackEnv();

  const unique = `${String(Date.now())}-${randomUUID().slice(0, 8)}`;
  const email = `e2e-${unique}@example.com`;
  const password = `E2e-${unique}-Pw1!`;

  const signup = await request.post(`${url}/auth/v1/signup`, {
    headers: { apikey: anonKey },
    data: { email, password },
  });
  expect(signup.status(), "Supabase sign-up").toBe(200);

  // Written before signing in, so a failed sign-in still leaves the teardown something to delete.
  await mkdir(AUTH_DIR, { recursive: true });
  await writeFile(EMAIL_FILE, email);

  // The route checks the Origin header of every mutating request against APP_ORIGIN.
  const signin = await request.post("/api/auth/signin", {
    form: { email, password },
    headers: { Origin: baseURL },
    maxRedirects: 0,
  });
  expect(signin.status(), "POST /api/auth/signin").toBe(302);
  expect(signin.headers().location, "sign-in redirect").toMatch(/\/dashboard$/);

  await request.storageState({ path: STORAGE_STATE });
});
