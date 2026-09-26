# Parked follow-ups (2026-09-23)

S-01 is merged and deployed (`d61c78a`) and proven end to end in CI. Production sign-in verification is parked, not failed.

## Blocked on the owner

- **Production email templates.** The first production emails (14:07 UTC) used Supabase's default English template, so their links don't reach `/auth/confirm`. Set "Magic link" and "Confirm signup" to `supabase/templates/magic-link.html` (runbook step).
- **Built-in mailer limit (~2 emails/hour).** Both emails went out in the same second, using up the hourly allowance. Retry one request after the window resets, then tick Progress 1.4, 2.4, 3.3–3.5 and archive.

## Bugs / improvements

- **Double submit on the sign-in form.** `SubmitButton` disables itself via `useFormStatus`, which only tracks React form actions, not the native POST used by `MagicLinkForm`, so a double click sends two requests. Fix: track submitting state in `MagicLinkForm` and disable the button on submit.
- **Rate limit is invisible.** By design the request always shows `/auth/check-email`. Consider adding a hint there ("no email within a few minutes? wait an hour before retrying") without revealing account existence.
- **Consider custom SMTP** if the 2/hour limit keeps getting in the way (changes the "built-in mailer" decision in the plan brief).

## Decision change (2026-09-23, later)

- **Password sign-in restored as an alternative** at the owner's request, after the first production attempts: the magic link stayed unusable while the production email templates were unset. The plan's "remove both" decision now applies only to sign-up: there is still no sign-up form.
- **Default-template links now work too** (same browser only): Supabase's `/verify` redirects to the Site URL with `?code=`, which `/` forwards to `/auth/confirm` for a PKCE code exchange. Setting the production templates is still recommended so links also work on another device.
