// Mints an alerts token for the scheduled evaluator (POST /api/alerts/evaluate). Prints the token once and the SQL that
// stores only its SHA-256 hash; paste the SQL into the Supabase SQL editor. Nothing is written to disk.
// Usage: node scripts/create-alert-token.mjs <label>
import { createHash, randomBytes } from "node:crypto";

const label = process.argv[2];
if (!label || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(label)) {
  console.error("Usage: node scripts/create-alert-token.mjs <label>  (lowercase letters, digits, hyphens)");
  process.exit(1);
}

const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");

console.log(`Token (store it as the workflow's repository secret; it is not shown again):\n\n  ${token}\n`);
console.log("SQL to run in the Supabase SQL editor:\n");
console.log(`  insert into public.alert_tokens (label, token_hash) values ('${label}', decode('${hash}', 'hex'));\n`);
console.log(`Revoke later with:\n\n  update public.alert_tokens set revoked_at = now() where label = '${label}';`);
