// What kind of Supabase key a SUPABASE_ANON_KEY value is. Pure, with no `astro:*` import and no logging, so the app
// (src/lib/supabase.ts) and the test guards (tests/support/local-guards.ts) classify keys with the same code.
// The key itself never leaves this function: callers get a class, not a prefix or a length.

export type AnonKeyClass =
  // An sb_publishable_ key: the new-style anon key.
  | "publishable"
  // A JWT of exactly three parts whose payload says role "anon": the legacy anon key.
  | "anon"
  // An sb_secret_ key.
  | "secret"
  // A JWT-shaped key whose payload says role "service_role" (any number of dot-separated parts of two or more).
  | "service_role"
  // Anything else: no known prefix, another role, an undecodable payload, surrounding whitespace.
  | "other";

// The role claim of the payload (second dot-separated part) of a JWT-shaped key, or null when it has none.
function jwtRole(parts: string[]): string | null {
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims: unknown = JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
    if (typeof claims === "object" && claims !== null && "role" in claims && typeof claims.role === "string") {
      return claims.role;
    }
    return null;
  } catch {
    return null;
  }
}

export function classifyAnonKey(key: string): AnonKeyClass {
  // Surrounding whitespace never changes whether a key is dangerous, but it makes a safe-looking key "other": a padded
  // key may work where it is pasted today, which is exactly what the warn-first release is there to find out.
  const trimmed = key.trim();
  if (trimmed.startsWith("sb_secret_")) return "secret";
  const parts = trimmed.split(".");
  const role = jwtRole(parts);
  // Dangerous first and by the widest test: a service_role payload is refused whatever the key's overall shape.
  if (role === "service_role") return "service_role";
  const safe = trimmed.startsWith("sb_publishable_")
    ? "publishable"
    : parts.length === 3 && role === "anon"
      ? "anon"
      : null;
  return safe !== null && trimmed === key ? safe : "other";
}
