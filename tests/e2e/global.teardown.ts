import { readFile, rm } from "node:fs/promises";
import { Client } from "pg";
import { requireDbUrl } from "./support/env";

const EMAIL_FILE = "tests/e2e/.auth/owner-email.txt";

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

  const db = new Client({ connectionString: requireDbUrl() });
  db.on("error", () => undefined);
  await db.connect();
  try {
    await db.query("delete from auth.users where email = $1", [email]);
  } finally {
    await db.end();
  }
  await rm(EMAIL_FILE, { force: true });
}
