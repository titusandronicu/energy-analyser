# Access-Key Sign-In — Plan Brief

> Full plan: `context/changes/access-key-sign-in/plan.md`

## What & Why

Replace email/password sign-in with the PRD's "access key": an emailed one-time link that logs the owner into a long-lived session. This is roadmap slice S-01 (FR-001). It's the last prerequisite for showing live state, the seasonal insight and today's recommendation (S-02–S-04), which all need a signed-in owner.

## Starting Point

The starter's password sign-in and a sign-up flow (gated by `ALLOW_SIGNUP`) are live, with English pages. Production Supabase already blocks public sign-up and has one owner account. Sessions already last: the auth cookies live 400 days and the middleware refreshes tokens on every request.

## Desired End State

The owner types their email on a Polish sign-in page and gets a link. They open it on any device, laptop or phone, and land on `/dashboard`, staying signed in until they sign out. No password or sign-up pages remain. CI proves the whole flow through a real email caught by Mailpit.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Link flow | Token-hash link verified at `/auth/confirm` (any device) | The default PKCE link only works in the requesting browser, which breaks "request on laptop, open on phone". |
| Passwords and sign-up | Remove both | Matches the PRD's "no account-creation form" and shrinks the attack surface; recovery goes through the Supabase dashboard. |
| CI proof | Smoke test reads the email from Mailpit | Exercises the real template and token verification without any service-role key. |
| Email delivery | Built-in Supabase mailer | The owner's email is a Supabase organisation member, and a few emails a day is well within limits. |
| `ALLOW_SIGNUP` | Now only lets a magic-link request create a user (true locally/CI, false in production) | Lets smoke sign in fresh users while production only serves the existing owner. |
| Account enumeration | Always show "check your email", log real errors server-side | Nobody can probe which addresses have accounts. |
| After sign-in | Always `/dashboard`; `next=` ignored | No open redirect through the confirm link. |
| Session length | Keep defaults (400-day cookies + refresh in middleware) | Already meets "long-lived session" with no code. |

## Scope

**In scope:** magic-link service and unit tests; `POST /api/auth/magic-link`; `GET /auth/confirm`; Polish email template for magic link and confirm-signup; local `site_url` fix; Polish sign-in and check-email pages; deleting the password and sign-up routes, pages and components; README/CLAUDE.md/.env.example updates; the Mailpit smoke test and CI change; the production runbook steps.

**Out of scope:** reusable pre-issued links, password fallback or reset, custom SMTP, per-user data and RLS policies, a `next=` redirect, and protection against link-prefetching mail scanners.

## Architecture / Approach

```text
/auth/signin (email) ──POST──► /api/auth/magic-link ──signInWithOtp──► Supabase ──email──► owner
                                     │ always 302 /auth/check-email
owner opens link (any device) ──GET──► /auth/confirm?token_hash=…&type=email
                                     │ verifyOtp → session cookies (400 days)
                                     ▼
                                /dashboard (middleware refreshes tokens on each request)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Magic-link request and confirmation | Service, 2 routes, email template, local config | Template or `site_url` mismatch gives broken links |
| 2. Sign-in UI and removal of the password flow | Polish pages; password and sign-up code deleted | A leftover link or import to a deleted page |
| 3. End-to-end verification and production rollout | Mailpit smoke in CI; dashboard templates; owner sign-in | Deploying before the dashboard templates are set breaks sign-in |

**Prerequisites:** local Supabase via the UGREEN relay, with port 54324 (Mailpit) added to `RELAY_PORTS`; access to the Supabase dashboard's email templates.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Assumes the owner's sign-in email is a member of the Supabase organisation. Otherwise the built-in mailer won't deliver, and custom SMTP becomes necessary.
- Mail clients that prefetch links (for example, Outlook Safe Links) could use up the one-time token before the owner clicks. Gmail doesn't. If it happens, add a confirm button page.
- Order matters in production: set the dashboard templates **before** deploying, or the default email's link won't work with `/auth/confirm`.

## Success Criteria (Summary)

- The owner signs in on production from a link opened on a different device and stays signed in the next day.
- CI signs in a fresh user through a real email and rejects a reused link.
- No password or sign-up code or pages remain.
