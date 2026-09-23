# Access-Key Sign-In Implementation Plan

## Overview

Replace email/password sign-in with an emailed one-time link (the PRD's "access key"). The owner enters their email, receives a link, opens it on any device, and lands in an authenticated session that lasts until they sign out. Password sign-in and the sign-up flow are removed. This is roadmap slice S-01 (FR-001, Access Control); it is the last prerequisite for S-02, S-03 (the north star) and S-04.

## Current State Analysis

- Sign-in is email + password: `src/pages/api/auth/signin.ts` → `signInWithPassword`, form in `src/components/auth/SignInForm.tsx`, page `src/pages/auth/signin.astro`.
- Sign-up exists behind `ALLOW_SIGNUP` (`src/lib/signup.ts`): `src/pages/api/auth/signup.ts`, `src/pages/auth/signup.astro`, `SignUpForm.tsx`, `PasswordToggle.tsx`, `src/pages/auth/confirm-email.astro`. Links to it in `Topbar.astro:27` and `Welcome.astro:36`.
- Production Supabase already disables global sign-up and has one owner account (`context/deployment/micrus-runbook.md:64`).
- `@supabase/ssr` 0.12.7 defaults to the PKCE flow (`createServerClient.js:37`), which only completes in the browser that requested the link. Session cookies default to a 400-day `maxAge`, and `src/middleware.ts` calls `getUser()` on every request, which refreshes the one-hour access token. A long-lived session therefore needs no extra code.
- Local `supabase/config.toml` has `site_url = "http://127.0.0.1:3000"` (the app runs on 4321), no custom email templates, and Mailpit (`[inbucket]`, port 54324) enabled locally. CI starts Supabase with `-x …mailpit…` (`.github/workflows/ci.yml:39`).
- `scripts/smoke.mjs:46-62` signs up and signs in with a password; CI runs it with `ALLOW_SIGNUP=true`.
- The UI language is Polish (roadmap decision, 2026-09-23); current auth pages are English.

## Desired End State

- `/auth/signin` shows one Polish form: an email field and "Wyślij link do logowania". Submitting always leads to `/auth/check-email`, whatever the address.
- The email contains a link to `/auth/confirm?token_hash=…&type=email`. Opening it on any device verifies the token server-side, sets the session cookies and redirects to `/dashboard`. An expired or reused link redirects to `/auth/signin` with a Polish error message.
- The session survives browser restarts and lasts until sign-out (400-day cookies plus refresh in the middleware).
- No password or sign-up pages, endpoints or components remain. `ALLOW_SIGNUP=true` (local/CI only) lets a magic-link request create a new user; in production (`false`) only existing users receive a link.
- CI's smoke test requests a link, reads it from Mailpit, follows it and reaches `/dashboard`, then signs out.

Verify with `npm test`, `npm run lint`, `npx astro check`, `npm run build`, and the CI smoke job.

### Key Discoveries:

- PKCE default that breaks cross-device links: `node_modules/@supabase/ssr/dist/main/createServerClient.js:37`.
- Token refresh on every request: `src/middleware.ts` (`supabase.auth.getUser()`).
- Current password flow to remove: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`, `src/components/auth/{SignInForm,SignUpForm,PasswordToggle}.tsx`, `src/pages/auth/{signup,confirm-email}.astro`.
- Sign-up links to remove: `src/components/Topbar.astro:27`, `src/components/Welcome.astro:36`.
- Mailpit is disabled in CI: `.github/workflows/ci.yml:39`.
- Existing service + test pattern to follow: `src/lib/services/ingest.ts` with `ingest.test.ts` (injected dependencies).

## What We're NOT Doing

- No pre-issued, reusable access link (parked on the roadmap).
- No password fallback, and no password reset or account-management pages.
- No custom SMTP provider; the built-in Supabase mailer is used (the owner's email is a member of the Supabase organisation).
- No per-user data or RLS read policies; later slices add them.
- No `next=` redirect parameter after sign-in; confirmation always lands on `/dashboard`, which avoids open redirects.
- No confirm-before-consume interstitial against mail scanners that prefetch links (see Open Risks in the brief).
- No change to the session length configuration; the defaults already give a long-lived session.

## Implementation Approach

Build the new path first (request → email → confirm) behind its own routes and prove it with unit tests. Then switch the UI to it and delete the password path, and finally prove the whole thing end to end in CI through Mailpit before touching production. Use the token-hash email link (`verifyOtp`) instead of the PKCE code exchange so the link works on any device.

## Critical Implementation Details

- **Email template decides the link.** With the token-hash flow the link comes from the email template, not from `emailRedirectTo`. Both `magic_link` and `confirmation` templates must use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. When `ALLOW_SIGNUP=true` creates a new user, Supabase sends the confirmation template instead of the magic-link one. `site_url` must match the origin the app runs on (local `http://127.0.0.1:4321`; production is already set).
- **No account enumeration.** The request endpoint always redirects to `/auth/check-email` after validation, including when Supabase rejects the address (for example, an unknown user with sign-up off) or rate-limits it. The real error is logged server-side only.

## Phase 1: Magic-link request and confirmation

### Overview

The new sign-in path, fully testable before any UI changes: a service with injected Supabase auth calls, the two routes, the email templates and local config.

### Changes Required:

#### 1. Magic-link service

**File**: `src/lib/services/magic-link.ts`, `src/lib/services/magic-link.test.ts`

**Intent**: Keep the routes thin and make the behaviour unit-testable, following the `ingest.ts` pattern of injected dependencies.

**Contract**:
- `requestMagicLink(form: FormData, deps: { sendOtp(email, { shouldCreateUser }): Promise<{ error }>, signupEnabled: boolean, logError? }) → { redirect: string }`. It validates the email with zod: an invalid address returns `/auth/signin?error=<Polish message>`. Otherwise it calls `sendOtp` with `shouldCreateUser = signupEnabled` and always returns `/auth/check-email`, logging any error without exposing it.
- `confirmMagicLink(url: URL, deps: { verifyOtp({ token_hash, type }): Promise<{ error }>, logError? }) → { redirect: string }`. A missing or blank `token_hash`, or a `type` other than `email`, returns `/auth/signin?error=<invalid link>`. A verify error returns `/auth/signin?error=<expired or already used>`. Success returns `/dashboard`. Any `next` parameter is ignored.

#### 2. Routes

**File**: `src/pages/api/auth/magic-link.ts`, `src/pages/auth/confirm.ts`

**Intent**: Wire the service to the cookie-bound Supabase client so `verifyOtp` sets the session cookies on the confirm response.

**Contract**: `POST /api/auth/magic-link` (form-encoded, subject to the existing Origin check) → 302 to the service's redirect; 302 to `/auth/signin?error=…` when Supabase isn't configured. `GET /auth/confirm` → 302 to the service's redirect. Both use `createClient(request.headers, cookies)` and `export const prerender = false`.

#### 3. Email templates and local config

**File**: `supabase/templates/magic-link.html`, `supabase/config.toml`

**Intent**: Emails carry the any-device token-hash link, in Polish. The local `site_url` matches the app's port, so links work in local development and CI.

**Contract**: One HTML template with the link `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`, used for both `[auth.email.template.magic_link]` and `[auth.email.template.confirmation]` with Polish subjects. `[auth] site_url = "http://127.0.0.1:4321"`, and `additional_redirect_urls` keeps `http://localhost:4321`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Service tests cover: invalid email → sign-in error; valid email → check-email even when `sendOtp` errors; `shouldCreateUser` follows `signupEnabled`; confirm with missing token, wrong type, verify error and success; `next` ignored
- Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`

#### Manual Verification:

- With local Supabase (`npx supabase db reset` via the remote-docker relay, including port 54324) and `npm run dev`, a `curl` POST to `/api/auth/magic-link` produces a Polish email in Mailpit whose link opens `/auth/confirm` and redirects to `/dashboard` with the session cookies set

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Sign-in UI and removal of the password flow

### Overview

Switch the user-facing pages to the magic link, in Polish, and delete everything password- or sign-up-related.

### Changes Required:

#### 1. Sign-in and check-email pages

**File**: `src/pages/auth/signin.astro`, `src/components/auth/MagicLinkForm.tsx`, `src/pages/auth/check-email.astro`

**Intent**: One email field that posts to `/api/auth/magic-link`, showing server errors (invalid email, invalid or expired link) with the existing `FormField`, `ServerError` and `SubmitButton` components. The check-email page explains in Polish that a link has been sent if the address is allowed, and that it can be opened on any device.

**Contract**: The form posts to `/api/auth/magic-link` with field `email`; client-side validation is limited to required and email format. The pending text is shown while submitting, per the NFR's continuous feedback.

#### 2. Remove the password and sign-up flow

**File**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`, `src/components/auth/{SignInForm,SignUpForm,PasswordToggle}.tsx`, `src/lib/auth-validation.ts`

**Intent**: Delete the files. Reduce `auth-validation.ts` to the email schema used by the magic-link service, or fold it into the service if nothing else uses it.

**Contract**: No route answers `/api/auth/signin`, `/api/auth/signup` or `/auth/signup` (404).

#### 3. Links, env and docs

**File**: `src/components/Topbar.astro`, `src/components/Welcome.astro`, `src/lib/signup.ts`, `.env.example`, `README.md`, `CLAUDE.md`

**Intent**: Remove the sign-up links. Document the new meaning of `ALLOW_SIGNUP`: it only lets magic-link requests create users, true only locally and in CI. Update the auth-flow description in `CLAUDE.md` and `README.md`: the magic link, `/auth/confirm`, the email templates and the production dashboard step.

**Contract**: `isSignupEnabled()` keeps its name and parsing; only its documented meaning changes.

### Success Criteria:

#### Automated Verification:

- Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`
- Unit tests pass: `npm test`
- No references to the removed routes or components remain: `grep -rnE "auth/signup|api/auth/signin|confirm-email|SignUpForm|PasswordToggle|signInWithPassword" src` returns nothing

#### Manual Verification:

- In `npm run dev`, the sign-in page and check-email page read well in Polish on a phone-width viewport, and an invalid-link error is shown on the sign-in page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: End-to-end verification and production rollout

### Overview

Prove the flow in CI through a real email, then roll out to production, where the templates are configured in the Supabase dashboard.

### Changes Required:

#### 1. Smoke test through Mailpit

**File**: `scripts/smoke.mjs`

**Intent**: Replace the sign-up/password steps with the magic-link flow. Request a link for a unique email, poll Mailpit's HTTP API until that recipient's message arrives, extract the `/auth/confirm` link, follow it with the cookie jar, then check the dashboard, sign-out and redirect steps. Keep the ingest steps unchanged.

**Contract**: `MAILPIT_URL` env (default `http://127.0.0.1:54324`). Steps: anonymous `/dashboard` → 302 `/auth/signin`; invalid email → 302 `/auth/signin?error=`; valid request → 302 `/auth/check-email`; email arrives within 10 s; confirm link → 302 `/dashboard`; `/dashboard` → 200; reused link → 302 `/auth/signin?error=`; sign-out → 302 `/`; `/dashboard` → 302 `/auth/signin`; `/auth/signup` → 404.

#### 2. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Start local Supabase with Mailpit and pass its URL to the smoke step.

**Contract**: Remove `mailpit` from the `supabase start -x` list, and export `MAILPIT_URL=http://127.0.0.1:54324` for `npm run smoke`.

#### 3. Production rollout

**File**: `context/deployment/micrus-runbook.md`

**Intent**: Record the one-time dashboard steps so production matches `config.toml`.

**Contract**: The runbook section gets:
1. Supabase → Authentication → Emails: set "Magic link" and "Confirm signup" to the template from `supabase/templates/magic-link.html` with the Polish subjects.
2. Confirm Site URL is `https://neil170-20170.mikrus.cloud`.
3. Merge and deploy.
4. The owner signs in via a link opened on a different device than the one that requested it.

### Success Criteria:

#### Automated Verification:

- CI `ci` job passes
- CI `smoke` job passes, including the Mailpit magic-link steps

#### Manual Verification:

- Production email templates set in the Supabase dashboard (runbook steps)
- After deploy, the owner requests a link on one device, opens it on another, and lands on `/dashboard`
- The session is still active after closing and reopening the browser the next day

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Magic-link request: validation, the always-generic success redirect, `shouldCreateUser` wiring, error logging without leaking the error.
- Confirm: the token/type checks, the verify error, success, and that `next` is ignored.

### Integration Tests:

- Smoke against local Supabase with Mailpit in CI: real email template, real token-hash verification, session cookies, a reused link rejected, sign-out, and removed routes returning 404.

### Manual Testing Steps:

1. Locally: request a link, open it from Mailpit, confirm you land on `/dashboard`.
2. Open the same link again and confirm the Polish "expired or already used" error.
3. In production after rollout: request a link on the laptop and open it on the phone.
4. The next day, reopen the browser and confirm you're still signed in.

## Performance Considerations

None. One Supabase auth call per request or confirm.

## Migration Notes

No database migration. Production needs the two email templates set in the Supabase dashboard **before** the deploy: until then, emails use Supabase's default template, whose PKCE-style link the new `/auth/confirm` route rejects. The existing owner account stays; its password becomes unused.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (FR-001, Access Control)
- Current auth flow: `src/pages/api/auth/signin.ts`, `src/middleware.ts`, `src/lib/supabase.ts`
- Production auth setup: `context/deployment/micrus-runbook.md:64`
- Service + test pattern: `src/lib/services/ingest.ts`, `src/lib/services/ingest.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Magic-link request and confirmation

#### Automated

- [x] 1.1 Unit tests pass: `npm test`
- [x] 1.2 Service tests cover request validation, generic redirect, shouldCreateUser, confirm cases and ignored next
- [x] 1.3 Lint, type check and build pass

#### Manual

- [ ] 1.4 Local curl request produces a Polish email in Mailpit whose link lands on /dashboard with a session

### Phase 2: Sign-in UI and removal of the password flow

#### Automated

- [ ] 2.1 Lint, type check and build pass
- [ ] 2.2 Unit tests pass: `npm test`
- [ ] 2.3 No references to removed routes or components remain

#### Manual

- [ ] 2.4 Sign-in and check-email pages read well in Polish at phone width; invalid-link error shown

### Phase 3: End-to-end verification and production rollout

#### Automated

- [ ] 3.1 CI `ci` job passes
- [ ] 3.2 CI `smoke` job passes including the Mailpit magic-link steps

#### Manual

- [ ] 3.3 Production email templates set in the Supabase dashboard
- [ ] 3.4 Owner signs in on production with a link opened on a different device
- [ ] 3.5 Session still active after reopening the browser the next day
