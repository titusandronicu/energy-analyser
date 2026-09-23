// Mints an ingest token for the home-lab push. Prints the token once and the SQL that stores
// only its SHA-256 hash; paste the SQL into the Supabase SQL editor. Nothing is written to disk.
// Usage: node scripts/create-ingest-token.mjs <label>
import { createHash, randomBytes } from "node:crypto";

const label = process.argv[2];
if (!label || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(label)) {
  console.error("Usage: node scripts/create-ingest-token.mjs <label>  (lowercase letters, digits, hyphens)");
  process.exit(1);
}

const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");

console.log(`Token (store it in the home lab's push config; it is not shown again):\n\n  ${token}\n`);
console.log("SQL to run in the Supabase SQL editor:\n");
console.log(`  insert into public.ingest_tokens (label, token_hash) values ('${label}', decode('${hash}', 'hex'));\n`);
console.log(`Revoke later with:\n\n  update public.ingest_tokens set revoked_at = now() where label = '${label}';`);
