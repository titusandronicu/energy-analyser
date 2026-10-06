import { readFile, rm } from "node:fs/promises";
import { Client } from "pg";
import { requireDbUrl } from "./support/env";

const EMAIL_FILE = "tests/e2e/.auth/owner-email.txt";
// The only shape auth.setup.ts ever writes. The teardown deletes a user only when the file still says exactly this, so a
// hand-edited or stale file can never point it at a real account.
const E2E_EMAIL = /^e2e-\d+-[0-9a-f]{8}@example\.com$/;

// Leaves no test user behind: its alert rules and notes go with it through the foreign-key cascade. Runs once, after
// every project. Local databases only (requireDbUrl refuses anything else).
export default async function globalTeardown(): Promise<void> {
  let email: string;
  try {
    email = (await readFile(EMAIL_FILE, "utf8")).trim();
  } catch {
    return; // the setup never got as far as creating a user
  }
  if (email === "") return;
  if (!E2E_EMAIL.test(email)) {
    throw new Error(`Refusing to delete "${email}": ${EMAIL_FILE} does not hold an e2e user's email.`);
  }

  const db = new Client({ connectionString: requireDbUrl() });
  db.on("error", () => undefined);
  try {
    await db.connect();
  } catch (cause) {
    throw new Error(
      "Cannot reach the local Postgres of the Supabase stack (default 127.0.0.1:54322, or SUPABASE_DB_URL) to remove " +
        "the test user. Start the relay with `scripts/remote-docker.sh relay-start` (it relays 54321 and 54322).",
      { cause },
    );
  }
  try {
    // The email pattern in the SQL is a second lock: even a wrong value above could only ever match an e2e user.
    await db.query("delete from auth.users where email = $1 and email like 'e2e-%@example.com'", [email]);
  } finally {
    await db.end();
  }
  await rm(EMAIL_FILE, { force: true });
}
