# Bill Forecast Card (S-07) Implementation Plan

## Overview

Put the home lab's deployed credit-aware bill forecast on the dashboard as a card that leads with a range, discloses the reference month its estimate rests on, and shows no figure at all when the data does not support one. The app displays; it never recomputes the price (`context/foundation/prd-v3.md:268`).

## Current State Analysis

The lab side is done and deployed. `bill-accuracy` (archived 2026-09-28) rewrote `web/data/current-month-bill-forecast.json` to estimate the PGE invoice under net metering ("opust", factor 0.8) instead of pricing every imported kWh, and the rule is written up in `docs/logic.md:79-99`. On real September data it reports 258 PLN, range 155–361, from 15 complete days at an export ratio of 0.809.

The app side does not exist in any form:

- `src/lib/ingest/contract.ts:62-75` has no bill section, and every object is `z.strictObject` (`contract.ts:3-5`), so the lab **cannot** push this data until the contract gains a section — an unknown key is a 422.
- `docs/ingest/contract-v1.schema.json` has no entry, and `npm test` fails on drift against the zod file (`src/lib/ingest/contract.test.ts:37-40`).
- There is no storage lane. `docs/ingest/README.md:43` lists three: raw pushes (14 days), daily totals, recommendations.
- `src/types.ts` (32 lines) has no type for it; `docs/ingest/README.md` never mentions a bill.
- The lab's push script does not send the section either — it only writes the file for the lab page and the Telegram bot.

So the roadmap's "the slice adds a contract section and a card" (`context/foundation/roadmap.md:303`) undercounts the work: it is a contract section, a read path, a view model, a card, glossary terms, four docs files, and a homelab-2 change.

Constraints discovered:

- **`confidence` reads `low` for about three weeks of every month.** PGE invoices roughly three weeks late and the connector holds only the latest one, so `reference_lag_months > 0` — which forces `low` — is the normal state from the 1st until about the 22nd (`context/changes/bill-forecast/change.md:24`, `docs/logic.md:93`).
- **The central figure jumps when a new invoice lands.** July's ratio was 0.53 against August's 0.81; on the same import that moves the estimate from 392 to 258 PLN (`docs/logic.md:93`). `context/archive/2026-09-27-bill-accuracy/reviews/plan-review.md:33` rated this CRITICAL for the consuming surface.
- **The range is wide** — 155–361 around 258, roughly ±40% (`docs/logic.md:95`). `context/archive/2026-09-27-bill-accuracy/reviews/plan-review.md:130` (F9) already flagged this against FR-011's "a range a non-expert can act on".
- **`status: "no_data"` bodies omit almost every key.** Only `reason`, `message`, `generated_at`, `month` and `method` are present (`change.md:23`). The Telegram bot rendering `0.00 PLN` on such a body was `context/archive/2026-09-27-bill-accuracy/reviews/plan-review.md:52` (CRITICAL) and is still unfixed as `bill-accuracy` 3.5.
- **`status: "ok"` does not mean fresh.** On a write failure nginx kept serving the previous file, still `status: "ok"`, with a 2.4x-overstated figure (`context/archive/2026-09-27-bill-accuracy/reviews/impl-review-phase-2.md:69`); the lab page and bot therefore treat a forecast older than 30 minutes as no data (`:71`).
- **The publisher is not validated.** A negative `feed_in_kwh` once produced `credit_left_kwh` of 150,260,570.8 and a 41M-PLN range end (`context/archive/2026-09-27-bill-accuracy/reviews/impl-review-phase-2.md:50-51`).
- **`closed_month_check` is optional** — the key is absent entirely when the reference period carries no invoice total (`change.md:21`) — and it tests the arithmetic, not the estimate: it cannot detect a wrong export ratio and drifts when PGE changes prices, sitting at −2.7% for August before any formula error (`docs/logic.md:97`).
- **Where the docs and the archived plan disagree, `docs/logic.md:79-99` is right.** `context/archive/2026-09-27-bill-accuracy/reviews/impl-review-phase-4.md:89` lists five behaviours of the running script that `context/archive/2026-09-27-bill-accuracy/plan.md` does not describe.

## Desired End State

The dashboard carries a fourth card, "Prognoza rachunku", between the live state and the usage insight. When the lab's data supports a figure it leads with the range in złoty, names the central estimate beneath it, states how many days and which days it rests on, carries a confidence badge, colours a verdict against the last real invoice, and folds the pricing basis and the closed-month check into a "Na podstawie" details block. When the data does not support a figure — no complete days, missing settlement facts, unreadable rates, a forecast older than 30 minutes, fewer than 7 complete days, or an implausible value — it shows why and no number.

Verify by opening `/dashboard` against a push carrying the section: the range is the headline, the reference month is named, and forcing each refusal path blanks the figure without breaking the other three cards.

### Key Discoveries:

- **The house pattern is rigid and fits this card.** A pure `toXView(row, now)` mapper returns a discriminated union carrying a `Status`; the `.astro` card is a dumb renderer taking one prop. See `src/lib/services/live-state.ts:81-115` with `src/components/LiveStateCard.astro`. All logic is unit-tested against the mapper — there are no markup tests in the repo (`vitest.config.ts:12`).
- **Colour lives in exactly one place**, `src/components/StatusBadge.astro:13-18`, keyed by `StatusTone` (`src/lib/format/status.ts:2`). Cards never write a green/amber/red class. Thresholds are named service constants mapped through a `Record`, as in `src/lib/services/usage-insight.ts:103-108`.
- **A nested `StatusBadge` is the established way to show a second signal.** `RecommendationCard.astro:79-84` renders `view.forecast.certainty` inside the card's `<dl>`. Confidence follows that precedent.
- **The basis affordance already exists in the right shape.** `RecommendationCard.astro:87-96` is a native `<details><summary>Na podstawie</summary>` with a bulleted list — no JS, no shadcn primitive. `TermsExplained.astro:8-9` records why native `<details>` is the choice (works on a phone without script; `py-1` keeps the tap target ≥24px, WCAG 2.5.8).
- **The new migration needs only the view.** `supabase/migrations/20260925123751_live_state_view.sql:6` already grants `select (source, captured_at, received_at, payload)` on `ingest_pushes` to `authenticated`, and `:8-12` already adds the owner read policy. A second `security_invoker` view over the same table inherits both.
- **`live_state` is not a precedent for an optional section.** It wraps the one section the contract makes required. Both optional sections go into their own accumulating tables instead — `daily_history` → `daily_energy` and `recommendation` → `recommendations`, written by the `ingest_push` function (`supabase/migrations/20260925151509_daily_forecast.sql:55-90`) and read straight from the table (`recommendation.ts:48-57`). A newest-push view over an optional section is a new pattern, and it only behaves if it filters on the key being present.
- **`formatPeriod` throws on an empty list** (`src/lib/format/period.ts:10-12`), so the mapper must guard before calling it.
- **`scripts/push-fixture.mjs:16` destructures by name** to build its state-only body, so a new section would silently ride along in the default push unless that line is extended.
- **`src/lib/ingest/contract.test.ts:24-28` throws unless `docs/ingest/example-v1.json` carries every section**, and `:15` parses that example strictly. Both need extending.

## What We're NOT Doing

- **Not recomputing or re-scaling anything.** No pricing, no re-deriving the range, no shifting a figure to a different basis — `prd-v3.md:268` says the app adds no pricing logic of its own. Display precision is a separate matter: the card deliberately shows whole złoty (phase 3), because a ±40% estimate quoted to the grosz asserts precision it does not have.
- **Not building a reconciliation view.** Predicted-vs-actual is a PRD non-goal (`prd-v3.md:278`); `closed_month_check` is disclosed inside the details block only, worded as a test of the arithmetic, never as the forecast's accuracy.
- **Not showing a colour verdict without a real invoice to compare with.** Falling back to `closed_month_check.computed_gross_pln` was rejected: it would silently change the colour's meaning from "against your last bill" to "against our own arithmetic".
- **Not hiding the figure while the reference month lags.** Grey "za mało danych" for three weeks of every month was rejected — it would leave the card blank for most of its life and fail US-03. The grey state stays reserved for fewer than 7 complete days (`change.md:14`).
- **Not leading with the central figure.** US-03's acceptance criterion asks for "a range rather than a single exact figure"; the central estimate is secondary.
- **Not fixing the Telegram bot.** `bill-accuracy` 3.5 (the bot printing `0.00 PLN` on a `no_data` body) stays deferred — the live `telegram-home` image is not built from the repo.
- **Not storing forecast history.** The figure is a current-month snapshot recomputed every 5 minutes; a newest-row view is enough, so no table and no retention decision.
- **Not the closed-period bill (S-08)**, the usage profile (S-10), or `grid-export-mismatch`.

## Implementation Approach

Follow the S-02 chain exactly: extend the strict contract, add a `security_invoker` view beside `live_state`, write a pure mapper holding every threshold as a named constant, and render it with a dumb `.astro` card. Every decision from the planning interview lands in the mapper so it is unit-testable with a fixed clock, which is where this repo has always put its thresholds (`context/archive/2026-09-26-data-period-transparency/plan.md:24`).

The refusal paths get the same weight as the happy path. There are six of them and they are the reason this change is not small: the lab publishes a figure that is frequently unreliable and occasionally absurd, and the card's job is to be honest about which. The mapper collapses all six into one `kind` variant carrying a Polish reason, following `UsageInsightView`'s `kind: "insufficient"` (`src/lib/services/usage-insight.ts:163-165`).

Validation is deliberately split. Shape and sign go in zod, where a violation is a 422 the lab must fix. Plausibility goes in the mapper, where a violation blanks this card and leaves the live state and recommendation updating — because the contract is strict and a single bad cost field would otherwise take the whole push down with it.

Phases 1–4 ship and deploy the app side. Only then does phase 5 change the lab, which is the order `docs/ingest/README.md:58-62` requires and the practice roadmap Open Question 1 records.

## Critical Implementation Details

**Timing & lifecycle.** The card reads two different clocks and they answer different questions. The forecast's own `generated_at` against 30 minutes says whether the lab is still computing the figure; the push's `captured_at` says whether the lab is still pushing at all. This card uses `generated_at` only — a stale forecast riding inside a fresh push is the documented failure (`context/archive/2026-09-27-bill-accuracy/reviews/impl-review-phase-2.md:69`), and `captured_at` staleness is already visible on the live state card. The dashboard reloads every 5 minutes while visible (`src/pages/dashboard.astro:73-87`), so a render-time check is enough.

**State sequencing.** The refusal checks must run in this order, because a later one can read a key an earlier one proves absent: `status: "no_data"` first (the body has almost no keys), then the 30-minute `generated_at` rule, then the plausibility ceiling, then the fewer-than-7-days grey state. Checking the day count first would read `completed_days_used` on a body that does not carry it.

## Phase 1: Contract section for the bill forecast

### Overview

Teach the v1 payload about the bill forecast so the lab can send it, with the `ok`/`no_data` split modelled in the schema rather than left to the reader.

### Changes Required:

#### 1. The zod contract

**File**: `src/lib/ingest/contract.ts`

**Intent**: Add a `bill_forecast` section covering both bodies the lab publishes, then a new optional top-level key. Model the split as a discriminated union on `status` so a `no_data` body carrying a figure is rejected at the boundary instead of reaching the card. Types enforce shape and sign only — no plausibility ceiling here, because a zod failure 422s the whole push and would take `state` and `recommendation` down with it.

**Contract**: A new `billForecast` schema between `dailyEnergy` (ends `:60`) and `ingestPayloadV1` (starts `:62`), plus `bill_forecast: billForecast.optional()` inside the top-level object. Fields follow `change.md:18-23`: the `ok` body carries `month`, `confidence`, `completed_days_used`, `observed_days`, `average_daily_import_kwh`, `projected_import_kwh`, `projected_bill_gross_pln`, `range_gross_pln` (`low`/`high`), `projected_credit_kwh`, `projected_billable_kwh`, `credit_left_kwh`, `settlement`, `pricing`, optional `closed_month_check`, `generated_at`, `method`; the `no_data` body carries only `status`, `reason`, `message`, `generated_at`, `month`, `method`.

Money and energy fields the app displays are `z.number().nonnegative()`. The **`settlement` block is deliberately permissive — plain `z.number()`** — because `reference_feed_in_kwh` is exactly the field observed negative in bill-accuracy's `context/archive/2026-09-27-bill-accuracy/reviews/impl-review-phase-2.md:50-51`, and a strict-object rejection there would 422 the entire push, stopping live state and the recommendation. That is the outcome this plan's validation split exists to prevent, so the sign check for settlement figures lives in the mapper beside the plausibility ceiling, where it blanks this card alone. `reference_lag_months` is a nonnegative integer. `diff_pct` is signed by nature. The union shape is a contract phases 2–5 depend on, so it is spelled out:

```ts
const billForecast = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ok") /* … full body … */ }),
  z.strictObject({
    status: z.literal("no_data"),
    reason: z.enum(["no_complete_days", "settlement_facts_missing", "rates_unavailable"]),
    message: z.string().max(500),
    generated_at: z.iso.datetime({ offset: true }),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    method: z.literal("net_metering_credit_estimate"),
  }),
]);
```

`z.toJSONSchema` renders a discriminated union as `oneOf` (verified against this project's zod 4.6.5), with both branches as full objects carrying `required` and `additionalProperties: false`; it serialises identically across calls, so the drift assertion re-asserts cleanly. Note `.finite()` is unnecessary here — plain `z.number()` already rejects `Infinity` and `NaN` in this zod version.

#### 2. The exported JSON Schema

**File**: `docs/ingest/contract-v1.schema.json`

**Intent**: Regenerate so the committed schema stops drifting from the zod file.

**Contract**: Produced by `npm run contract:export`, never hand-edited. The drift assertion is `src/lib/ingest/contract.test.ts:37-40`.

#### 3. The example payload and its section check

**File**: `docs/ingest/example-v1.json`, `src/lib/ingest/contract.test.ts`

**Intent**: Give the example a valid `ok` body, since it is parsed strictly and is the base every test clones. Extend the `sections()` guard so a future contributor cannot drop the section from the example.

**Contract**: `example-v1.json` gains a `bill_forecast` block using the real September figures from `docs/logic.md:95` so the example documents plausible values. `sections()` at `contract.test.ts:24-28` adds `bill_forecast` to the list it requires.

#### 4. The fixture push script

**File**: `scripts/push-fixture.mjs`

**Intent**: Keep the default push state-only, and stop the committed example's timestamp from making the card permanently stale. The script destructures by name at `:16`, so the new section would otherwise ride along and contradict `docs/ingest/README.md:52`. Separately, the example's `bill_forecast.generated_at` is a fixed literal, so under phase 3's 30-minute rule every fixture push would render the refusal state and the happy path would never be exercised — the same problem the example's fixed `recommendation.generated_at` already causes, which is why `smoke.mjs:53` rewrites it at run time.

**Contract**: The destructure at `:16` also strips `bill_forecast` into the discarded group. On a `--full` push, `bill_forecast.generated_at` is rewritten to now alongside the existing `captured_at` rewrite at `:17`. The committed example keeps its fixed timestamp, so the strict parse and the drift assertion stay deterministic.

A new `--file <path>` flag reads the body from an arbitrary file instead of the hardcoded `example-v1.json` at `:15`, with the same `captured_at` and `generated_at` rewrites applied. Without it the plan's manual test steps are not executable: they need seven distinct bodies, and the only alternative is repeatedly editing the tracked example that the strict parse (`contract.test.ts:15`) and the drift assertion depend on — which risks a test fixture landing in a commit.

#### 5. Variant bodies for the refusal paths

**File**: `scripts/fixtures/bill-forecast/*.json` (new)

**Intent**: Give the manual test steps the bodies they need, as tracked files rather than throwaway edits, so the checks are repeatable by the next person.

**Contract**: One file per case the Testing Strategy exercises: the three `no_data` reasons, a backdated `generated_at`, 6 and 7 complete days, three bodies around the ±20% verdict line, one without `closed_month_check`, and one above the plausibility ceiling. Each is a complete v1 payload so `--file` can send it whole. Note `--file` still rewrites `captured_at` and `bill_forecast.generated_at`, so the deliberately-stale variant needs `--keep-generated-at`; the script says so on every rewrite.

#### 6. Contract tests

**File**: `src/lib/ingest/contract.test.ts`

**Intent**: Pin the boundary behaviour the card will rely on.

**Contract**: Cases for an accepted `ok` body; an accepted `no_data` body; a `no_data` body carrying `projected_bill_gross_pln` rejected; a negative `projected_import_kwh` and a negative `projected_bill_gross_pln` rejected; **a negative `reference_feed_in_kwh` accepted**, with the test naming the mapper as the place that guards it; an unknown key inside `bill_forecast` rejected; a payload with no `bill_forecast` still accepted.

The settlement case is deliberately the opposite way round from the displayed figures: item #1 keeps that block permissive so a bad disclosure cannot 422 the whole push, so the boundary test pins that leniency rather than contradicting it.

### Success Criteria:

#### Automated Verification:

- `npm run contract:export` leaves no diff in `docs/ingest/contract-v1.schema.json`
- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- `node scripts/push-fixture.mjs --file scripts/fixtures/bill-forecast/<case>.json` sends each variant body and is accepted, with `--keep-generated-at` for `stale-generated-at.json`
- `node scripts/push-fixture.mjs` against a local server still sends only the `state` section
- `node scripts/push-fixture.mjs --full` is accepted with the new section present and its `generated_at` rewritten to now

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Read path

### Overview

Expose the newest forecast section to the owner through a view, mirroring `live_state`.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_bill_forecast_view.sql`

**Intent**: Add a `security_invoker` view returning the newest push **that carries a forecast section**. No grant and no policy are needed: the column grant on `payload` and the owner read policy already exist from `20260925123751_live_state_view.sql:6-12`.

The key-presence predicate is the difference between this view and `live_state`, and it is not optional. `live_state` can take the newest push unconditionally because `state` is required (`contract.ts:66`); `bill_forecast` is optional, so without the predicate any push that omits it would blank the card and throw away a good forecast from minutes earlier. Staleness is the `generated_at` rule's job (phase 3), not the row's.

**Contract**: `create view public.bill_forecast with (security_invoker = true) as select p.captured_at, p.received_at, p.payload -> 'bill_forecast' as bill_forecast from public.ingest_pushes p where p.source = 'homelab' and p.payload ? 'bill_forecast' order by p.captured_at desc limit 1;` followed by `revoke all … from anon, authenticated` and `grant select … to authenticated`, exactly as `:26-27`. Comments record that the grant and policy are inherited, so a reader does not think they were forgotten, and why the key-presence predicate is there.

#### 2. Row type

**File**: `src/types.ts`

**Intent**: Add the row interface. The payload-derived column stays `unknown` on purpose, as `LiveStateRow.state` does at `:17-21` — the ingest contract validated it on the way in, but readers still treat the shape as untrusted.

**Contract**: `BillForecastRow { captured_at: string; received_at: string; bill_forecast: unknown }`.

#### 3. Loader

**File**: `src/lib/services/bill-forecast.ts` (new)

**Intent**: Read the single row, throwing on a query error so the page shows a load failure rather than pretending there is no data.

**Contract**: `loadBillForecast(client)` following `src/lib/services/live-state.ts:40-48` — `.from("bill_forecast").select(…).limit(1).overrideTypes<BillForecastRow[], { merge: false }>()`, throwing `loading bill forecast failed: …`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a reset database: `npx supabase db reset`
- Unit tests pass, including the loader's query shape: `npm test`
- Linting and type checks pass: `npm run lint`

#### Manual Verification:

- Signed in as an owner, the view returns the newest section; as anon it returns nothing
- The migration adds no grant or policy beyond the view itself

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: View model

### Overview

Turn the raw section into a view object carrying every decision from planning, with each threshold a named constant and each path unit-tested against a fixed clock.

### Changes Required:

#### 1. The mapper

**File**: `src/lib/services/bill-forecast.ts`

**Intent**: Build a discriminated union the card renders without deciding anything. Collapse all six refusal paths into one variant carrying a Polish reason, following `UsageInsightView`'s `kind: "insufficient"` (`usage-insight.ts:163-165`).

**Contract**: `toBillForecastView(row: BillForecastRow | null, now: Date): BillForecastView`, a union of `{ kind: "forecast"; … }`, `{ kind: "unavailable"; status; reason }` and `{ kind: "empty"; status }`. Refusal checks run in the order fixed under Critical Implementation Details. Named constants:

- `FORECAST_STALE_AFTER_MS = 30 * 60 * 1000` — judged against the body's own `generated_at`, not `captured_at`.
- `MIN_COMPLETE_DAYS = 7` — below it the grey "za mało danych" state (`change.md:14`).
- A settlement sign guard: a negative `reference_consumed_kwh`, `reference_feed_in_kwh` or `export_ratio` blanks the figure, since zod deliberately lets those through to keep a bad disclosure from breaking ingestion.
- A range-ordering guard: `range_gross_pln.low > high` blanks the figure. Left out of zod for the same reason as the sign guard — a reversed range is a lab bug, and a refine would 422 the whole push.
- `MAX_PLAUSIBLE_BILL_PLN = 7000` — derived from the lab's own bounds: it drops a day above 200 kWh as a counter glitch (`docs/logic.md:85`), and 200 × 31 × 1.0991 + 44.62 ≈ 6859. A central figure or range end above this blanks the figure rather than rejecting the push.
- `BILL_AMBER_RATIO = 1.2` — the colour bands from `change.md:14`.

A `month` mismatch is handled separately from the refusal paths. When the body's `month` is not the current Warsaw month — `warsawParts(now).dayKey.slice(0, 7)` — the badge drops to `problem` naming the month the figure actually covers, and the figure still renders. This follows `isFromEarlierDay` (`recommendation.ts:59-61`, surfaced at `:73-75` and relabelled at `RecommendationCard.astro:65-75`): the repo's handling for wrong-period data is relabel-and-keep-showing, never withholding. It matters because a forecast generated at 23:58 on the last day of a month and read at 00:05 the next is still inside the 30-minute freshness window. If `warsaw-time.ts` gains a month helper for this, that is its house location.

The verdict compares the central `projected_bill_gross_pln` with `closed_month_check.invoice_gross_pln`: at or below it is `good`, at or below +20% is `watch`, above is `problem`. Exactly at a line takes the milder status, the repo-wide rule at `docs/logic.md:49-70`. When `closed_month_check` is absent there is no comparison and the verdict is a fourth, `insufficient`-toned state saying so — never a fallback to `computed_gross_pln`.

Confidence maps through a `Record<"low"|"medium"|"high", Status>` in the shape of `BAND_STATUS` (`usage-insight.ts:103-108`) and is rendered as a nested badge. Its label names the reference month when `reference_lag_months > 0`, which is how a lagging reference stays visible without hiding the figure.

The day label comes from `formatPeriod` over the dates in `observed_days`; because it throws on an empty list (`period.ts:10-12`), an empty or absent array falls back to a bare count from `completed_days_used`.

#### 2. Money formatting

**File**: `src/lib/format/values.ts`

**Intent**: Add a złoty formatter. Whole złoty, not grosze: the figure carries a ±40% band, so decimals would assert precision the estimate does not have.

**Contract**: `plnLabel(value: unknown): string` returning e.g. `"258 zł"` or `MISSING`, built on a zero-decimal `pl-PL` `Intl.NumberFormat` beside `oneDecimal` at `:5`, and guarded by `asNumber` like `kwhLabel` at `:16-19`.

#### 3. Tests

**File**: `src/lib/services/bill-forecast.test.ts` (new)

**Intent**: Cover every path, following the fixed-clock factory style of `src/lib/services/live-state.test.ts:17-34`.

**Contract**: Cases for each of the three `no_data` reasons; a forecast at exactly 30 minutes (not stale) and at 30 minutes plus a second (stale); 6 and 7 complete days; the verdict at equal, at exactly +20% and above +20%; `closed_month_check` absent; a range end above the plausibility ceiling; an empty `observed_days`; each confidence level, including a `low` whose label names the reference month; a body whose `month` is not the current Warsaw month, keeping the figure and dropping the badge to `problem`; a reversed `range_gross_pln`; a null row; and non-numeric values rendering `MISSING`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, covering all three `no_data` reasons, both freshness boundaries, both day-count boundaries, all three verdict boundaries, the absent-invoice case, the plausibility ceiling and a wrong-month body: `npm test`
- Linting and type checks pass: `npm run lint`

#### Manual Verification:

- The Polish copy for every refusal reason reads as an explanation a non-expert can act on, not a status code

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Card, dashboard and docs

### Overview

Render the view model and record the rules in the project docs.

### Changes Required:

#### 1. The card

**File**: `src/components/BillForecastCard.astro` (new)

**Intent**: A dumb renderer. Lead with the range, name the central estimate beneath it, and fold the basis into a details block.

**Contract**: One prop, `{ view: BillForecastView | null }`, with `view === null` mapping to `LOAD_FAILED` exactly as `LiveStateCard.astro:14` and `:23` do. The card shell string is copied verbatim from `LiveStateCard.astro:17-21`. The range is the headline; the central figure reads "ok. 258 zł" beneath it; the day label and a nested confidence `StatusBadge` sit in the `<dl>` as `RecommendationCard.astro:79-84` does. A `<details><summary>Na podstawie</summary>` block in the shape of `RecommendationCard.astro:87-96` carries the pricing basis — the reference month, its lag, the export ratio, the rates and `rates_verified_on` — and, when the key is present, one line for the closed-month check naming the checked month and the difference, worded as a test of the arithmetic. When `credit_left_kwh > 0` a further line says banked credit already covers the month's import, so the projection is only the fixed fee — without it the card would show a strikingly low, trivially green figure and no reason for it. A `<TermsExplained>` box closes the card. `data-testid` attributes follow the existing naming for future Playwright work.

#### 2. Glossary terms

**File**: `src/lib/format/glossary.ts`

**Intent**: Explain the cost terms where they first appear, as `prd-v3.md:256` requires.

**Contract**: Three entries added to the `GlossaryTerm` union at `:2-3` and the `GLOSSARY` record at `:5`: the projected bill, net metering ("opust") and the range. One plain-Polish sentence each, in the register already set at `:6-43`. The card also reuses the existing `kwh`, `grid_import` and `grid_export` terms.

#### 3. Dashboard wiring

**File**: `src/pages/dashboard.astro`

**Intent**: Load and place the card. It goes second, right after the live state: late cost feedback is the first problem the PRD names, which is why `docs/decisions.md:20` moved this slice up.

**Contract**: A fourth entry in the `Promise.all` tuple at `:34-48` — mind the explicit tuple type annotation at `:34` — wrapped in `orLoadError` and passed the shared `now` from `:33`, plus one line in the markup at `:66-68`.

#### 4. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Keep CI's smoke run green and give the new card a marker of its own. The script asserts against the whole dashboard HTML, so a fourth card can break an existing step without touching its code.

**Contract**: Three existing `notContains` assertions — `"Nieaktualna"` (`:92`), `"Dane nieaktualne"` (`:97`) and `"Nie udało się wczytać porównania"` (`:103`) — constrain the new card's Polish copy: none of its states may contain those substrings. The script rewrites `bill_forecast.generated_at` to now in the same place it already rewrites `recommendation.generated_at` (`:53`), without which the card renders its refusal state on every smoke run. A new step asserts a marker string unique to the card's happy path.

#### 5. Project docs

**File**: `docs/logic.md`, `docs/decisions.md`, `docs/ingest/README.md`

**Intent**: Keep the docs in step with the code, as `context/foundation/lessons.md:12-17` requires.

**Contract**: In `docs/logic.md`, flip `:81` from "the screen for it is not" to the built state, and add an App row to the routing table at `:7-16` for the card's own rules (freshness, minimum days, verdict bands, plausibility ceiling) pointing at `src/lib/services/bill-forecast.ts`. In `docs/decisions.md`, one dated 2026-09-28 entry per decision taken here: range as the headline, a lagging reference disclosed rather than hidden, the verdict reference and its absent case, the 30-minute freshness rule, the split of validation between contract and mapper, and the closed-month check confined to the details block. In `docs/ingest/README.md`, add the section to the payload list at `:19-21`, the storage line at `:43`, and the fixture-push workflow at `:52` — that line still documents only `--full` and claims the script sends only `state`, so `--file` and `--keep-generated-at` belong there where an operator will look.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting and type checks pass: `npm run lint`
- Production build succeeds: `npm run build`
- The smoke test passes against a running server with the new card present: `npm run smoke`

#### Manual Verification:

- On `/dashboard` against a full fixture push, the card renders second with the range as its headline and the central estimate beneath
- The "Na podstawie" block names the reference month, its lag and the rate date; the closed-month line appears only when the key is present
- Each refusal path shows its reason and no number, and the other three cards keep rendering
- The card is readable at phone width, and every state is legible with colour ignored
- The glossary box explains the cost terms in plain Polish

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Lab push and production

### Overview

With the contract deployed, have the lab send the section and confirm the card against the real figure.

### Changes Required:

#### 1. The lab push

**File**: homelab-2 `infra/compose/energy-app/scripts/push-energy-analyser.py`

**Intent**: Include the forecast file's contents as the `bill_forecast` section. The app must be deployed first — `docs/ingest/README.md:58-62` is explicit that an optional field is backward compatible within v1 only once the app is live.

**Contract**: The push reads `web/data/current-month-bill-forecast.json` and sends it under `bill_forecast`, unchanged. Because the contract is strict, any key the lab emits that the section does not declare is a 422 for the entire push — so the field list must be reconciled against the running script, not against `context/archive/2026-09-27-bill-accuracy/plan.md`, which that change's `context/archive/2026-09-27-bill-accuracy/reviews/impl-review-phase-4.md:89` shows diverges from it in five places. The body stays within the 256 KB cap (`docs/ingest/README.md:16`), and no POD or customer identifier leaves the lab (`:26`).

#### 0. Preflight before the lab sends anything

**Intent**: Prove the real file parses before it can take ingestion down. A strict-contract 422 rejects the _whole_ payload, so a single undeclared or mistyped key stops live state and the recommendation updating in production until the lab is reverted. This is the plan's weakest assumption, so it gets a gate rather than a hope.

**Contract**: Take a copy of the lab's current `current-month-bill-forecast.json`, wrap it as a `bill_forecast` section in a complete v1 body under `scripts/fixtures/bill-forecast/`, and run it through the deployed contract — `npx vitest`-style `ingestPayloadV1.safeParse`, or one `scripts/push-fixture.mjs --file` call against a local server. Reconcile every mismatch in the zod section before touching the lab. Rollback for this phase is reverting the push script's forecast block; the app side needs no rollback because the section is optional.

#### 2. Prerequisites

**File**: `docs/prerequisites.md`

**Intent**: Record the external dependency, as `context/foundation/lessons.md:5-10` requires.

**Contract**: Update the S-07 row at `:81` to say the section is pushed, naming the lab script, the source file and the Home Assistant settlement entities the forecast depends on.

### Success Criteria:

#### Automated Verification:

- The real lab forecast file parses against the deployed contract before the lab is changed (preflight)
- The app's deployed contract accepts a real lab push: `/api/ingest` returns 2xx, no 422 in the logs
- Unit tests and lint still pass: `npm test`, `npm run lint`

#### Manual Verification:

- The production card shows a figure matching the lab page for the same refresh
- The reference month named on the card matches `settlement.reference_period` in the lab's file
- Stopping the lab's forecast job blanks the figure once its `generated_at` passes 30 minutes — by the freshness rule, not by the view's row disappearing — while the other cards keep updating
- A push that omits `bill_forecast` entirely leaves the last good forecast on the card rather than blanking it
- `docs/prerequisites.md` names every external dependency the card needs

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- Contract boundary: both bodies accepted, a `no_data` body carrying a figure rejected, a negative energy value rejected, an unknown key rejected, the section absent still accepted.
- Mapper: every refusal path, both sides of each threshold (30 minutes, 7 days, +20%), the absent `closed_month_check`, the plausibility ceiling, an empty `observed_days`, and each confidence level.
- Boundary convention: exactly at a line takes the milder status, matching `docs/logic.md:49-70` and the `it.each` precedent at `usage-insight.test.ts:323-334`.

### Integration Tests:

- A fixture push carrying the section is accepted end to end and surfaces through the view to the card.
- The default `push-fixture.mjs` push stays state-only.

### Manual Testing Steps:

1. Push the full fixture locally and open `/dashboard`; confirm the card renders second, range first.
2. Push a `no_data` body for each of the three reasons; confirm each shows its own explanation and no number.
3. Backdate `generated_at` past 30 minutes; confirm the figure disappears and the other cards still render.
4. Push a body with 6 complete days, then 7; confirm the grey state appears only below 7.
5. Push bodies at, just under and above +20% of the invoice; confirm green, green and red at the boundaries.
6. Remove `closed_month_check`; confirm no colour verdict and no closed-month line in the details.
7. Push a range end above the plausibility ceiling; confirm the figure is blanked and the push still succeeded.
8. Narrow the viewport to phone width and re-read every state.

## Performance Considerations

None material. The view returns a single row from the same table and index path the live state already uses, adding one query to a page that already runs three in parallel (`src/pages/dashboard.astro:34-48`). All formatting is server-side; the card ships no client JavaScript.

## Migration Notes

The migration adds a view only — no table, no data movement, no backfill — so it is reversible with a `drop view`. Existing pushes carry no `bill_forecast` key; because the view filters on the key being present, it simply returns no row until the first push that carries one, and the mapper's empty state covers that. Nothing needs re-ingesting. Because the contract change is an optional addition, older lab versions keep pushing successfully throughout, and a rollback of the lab script leaves the card on its empty state rather than breaking ingestion.

## References

- Change identity and the payload inventory: `context/changes/bill-forecast/change.md`
- The lab-side rule this card renders: `docs/logic.md:79-99`
- Lab implementation and its reviews: `context/archive/2026-09-27-bill-accuracy/`
- Period, status and plain-language rules this card inherits: `context/archive/2026-09-26-data-period-transparency/`
- Staleness and read-path precedent: `context/archive/2026-09-25-live-state-with-staleness/`
- Requirements: `context/foundation/prd-v3.md` US-03 (`:93-103`), FR-011 (`:189`), FR-018/019 (`:205-206`)
- Similar implementation: `src/lib/services/live-state.ts:81-115`, `src/components/LiveStateCard.astro`, `supabase/migrations/20260925123751_live_state_view.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Contract section for the bill forecast

#### Automated

- [x] 1.1 `npm run contract:export` leaves no diff in `docs/ingest/contract-v1.schema.json` — 2246377
- [x] 1.2 Unit tests pass: `npm test` — 2246377
- [x] 1.3 Linting passes: `npm run lint` — 2246377
- [x] 1.4 Production build succeeds: `npm run build` — 2246377

#### Manual

- [x] 1.5 `node scripts/push-fixture.mjs --file scripts/fixtures/bill-forecast/<case>.json` sends each variant body and is accepted, with `--keep-generated-at` for `stale-generated-at.json` — 2246377
- [x] 1.6 `node scripts/push-fixture.mjs` against a local server still sends only the `state` section — 2246377
- [x] 1.7 `node scripts/push-fixture.mjs --full` is accepted with the new section present and its `generated_at` rewritten to now — 2246377

### Phase 2: Read path

#### Automated

- [x] 2.1 Migration applies cleanly on a reset database: `npx supabase db reset` — 7f8b4ee
- [x] 2.2 Unit tests pass, including the loader's query shape: `npm test` — 7f8b4ee
- [x] 2.3 Linting and type checks pass: `npm run lint` — 7f8b4ee

#### Manual

- [x] 2.4 Signed in as an owner, the view returns the newest section; as anon it returns nothing — 7f8b4ee
- [x] 2.5 The migration adds no grant or policy beyond the view itself — 7f8b4ee

### Phase 3: View model

#### Automated

- [x] 3.1 Unit tests pass, covering all three `no_data` reasons, both freshness boundaries, both day-count boundaries, all three verdict boundaries, the absent-invoice case, the plausibility ceiling and a wrong-month body: `npm test`
- [x] 3.2 Linting and type checks pass: `npm run lint`

#### Manual

- [x] 3.3 The Polish copy for every refusal reason reads as an explanation a non-expert can act on, not a status code

### Phase 4: Card, dashboard and docs

#### Automated

- [ ] 4.1 Unit tests pass: `npm test`
- [ ] 4.2 Linting and type checks pass: `npm run lint`
- [ ] 4.3 Production build succeeds: `npm run build`
- [ ] 4.4 The smoke test passes against a running server with the new card present: `npm run smoke`

#### Manual

- [ ] 4.5 On `/dashboard` against a full fixture push, the card renders second with the range as its headline and the central estimate beneath
- [ ] 4.6 The "Na podstawie" block names the reference month, its lag and the rate date; the closed-month line appears only when the key is present
- [ ] 4.7 Each refusal path shows its reason and no number, and the other three cards keep rendering
- [ ] 4.8 The card is readable at phone width, and every state is legible with colour ignored
- [ ] 4.9 The glossary box explains the cost terms in plain Polish

### Phase 5: Lab push and production

#### Automated

- [ ] 5.1 The real lab forecast file parses against the deployed contract before the lab is changed (preflight)
- [ ] 5.2 The app's deployed contract accepts a real lab push: `/api/ingest` returns 2xx, no 422 in the logs
- [ ] 5.3 Unit tests and lint still pass: `npm test`, `npm run lint`

#### Manual

- [ ] 5.4 The production card shows a figure matching the lab page for the same refresh
- [ ] 5.5 The reference month named on the card matches `settlement.reference_period` in the lab's file
- [ ] 5.6 Stopping the lab's forecast job blanks the figure once its `generated_at` passes 30 minutes — by the freshness rule, not by the view's row disappearing — while the other cards keep updating
- [ ] 5.7 A push that omits `bill_forecast` entirely leaves the last good forecast on the card rather than blanking it
- [ ] 5.8 `docs/prerequisites.md` names every external dependency the card needs
