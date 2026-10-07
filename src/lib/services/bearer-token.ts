// The token of an `Authorization: Bearer <token>` header, or null when the header is missing or does not have exactly
// that shape (one token, no inner whitespace). The scheme is case-insensitive.
export function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get("Authorization") ?? "");
  return match?.[1] ?? null;
}
