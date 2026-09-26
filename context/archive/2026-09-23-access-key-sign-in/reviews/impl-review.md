<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Access-Key Sign-In

- **Plan**: context/changes/access-key-sign-in/plan.md
- **Scope**: Full plan (phases 1–2 complete; phase 3 automated rows complete, manual rows 3.3–3.5 open), including follow-up PRs #13 and #16
- **Reviewed phases**: 1, 2
- **Date**: 2026-09-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated checks on `chore/s01-close-out` (includes #13, #16): `npm test` 66/66, `npm run lint` clean, `npx astro check` 0 errors. CI smoke on #16 passed, including the magic-link, code-forwarding and password steps.

## Findings

### F1 — Session cookies are readable by page scripts and not marked Secure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/supabase.ts (createServerClient options)
- **Detail**: `@supabase/ssr` defaults to `httpOnly: false` and sets no `secure` flag (`node_modules/@supabase/ssr/dist/main/utils/constants.js`). A local request to `/api/auth/magic-link` shows `Set-Cookie: sb-…-code-verifier=…; Max-Age=34560000; Path=/; SameSite=Lax`, with no HttpOnly and no Secure. The session cookies have the same flags, so any script on the page could read the 400-day refresh token. The app has no browser Supabase client, so it never needs JavaScript access to these cookies.
- **Fix**: Pass `cookieOptions: { httpOnly: true, secure: import.meta.env.PROD, sameSite: "lax" }` to `createServerClient`, and check that sign-in, sign-out and the smoke test still pass.
- **Decision**: FIXED — cookieOptions { httpOnly: true, secure when APP_ORIGIN is https, sameSite: lax } in src/lib/supabase.ts; verified locally (HttpOnly set, password sign-in → dashboard → sign-out)

### F2 — Plan decision "remove passwords" reversed; criterion 2.3 no longer holds

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/access-key-sign-in/plan.md (Progress 2.3)
- **Detail**: #16 restored password sign-in at the owner's request, so criterion 2.3's grep now finds 10 matches (`api/auth/signin`, `signInWithPassword`). This is intentional and recorded in the plan's Implementation Notes and in `follow-ups/parked.md`, but the ticked row reads as if it still held.
- **Fix**: Accept. The Implementation Notes explain it; don't edit the Progress title.
- **Decision**: ACCEPTED — intentional per #16, documented in the plan's Implementation Notes

### F3 — Default-email `?code=` path verified only in parts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/index.ts, src/lib/services/magic-link.ts (exchangeCode)
- **Detail**: CI proves forwarding and rejection of an unknown code, and a local request shows the PKCE verifier cookie is set on the link request. A successful real code exchange hasn't been observed, because production links were rate-limited after #16 deployed.
- **Fix**: Verify once in production when a link is next requested in the same browser, or set our template (issue #18), which uses the token-hash path already proven in CI.
- **Decision**: ACCEPTED — verification tracked under issue #18 (verify once in production or set the templates)

### F4 — Password attempts share the server's IP at Supabase

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signin.ts
- **Detail**: Sign-in calls Supabase from the VPS, so Supabase's per-IP auth rate limit sees every visitor as one IP. Repeated wrong-password attempts by anyone can temporarily block the owner's own sign-in, and Supabase can't tell attackers apart. The generic error message is correct, and origin checks protect against CSRF.
- **Fix**: Accept for single-user v1. Revisit with a proxy-level rate limit if abuse appears, together with leaked-password protection (issue #19).
- **Decision**: ACCEPTED — single-user v1 risk; revisit with a proxy rate limit (related #19)
