// Smoke test: proves the built Node app, the Supabase auth flow and the push ingestion path work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// Sign-in reads the magic-link email from Mailpit (MAILPIT_URL); ingest steps use the local/CI seed token;
// SUPABASE_URL + SUPABASE_ANON_KEY enable the direct-table check. Needs ALLOW_SIGNUP=true on the server.
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { URL } from "node:url";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const INGEST_TOKEN = process.env.INGEST_TOKEN ?? "local-dev-ingest-token-not-secret";
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
// The example push the ingest steps send (and the pending-day check below reads); loaded first because the steps list uses it.
const example = JSON.parse(readFileSync(new URL("../docs/ingest/example-v1.json", import.meta.url), "utf8"));
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
const email = `smoke-${Date.now()}@example.com`;
const jar = new Map();
let signinLink = "";

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form, readBody = false, origin = BASE_URL } = {}) {
  const response = await fetch(new URL(path, BASE_URL), {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: origin,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response);
  const body = readBody ? await response.text() : undefined;
  return { status: response.status, location: response.headers.get("location") ?? "", body };
}

// A recommendation generated "now", with a text unique to this run, pushed before the dashboard check.
// The bill forecast's generated_at is rewritten the same way and for the same reason: the example's fixed
// timestamp is always older than the card's 30-minute freshness rule, so without this the card would render
// its refusal state on every smoke run and the happy path would never be exercised.
// The period summaries are rebuilt "now" as well, with the today text unique to this run: the app keeps the entry
// with the latest built_at, so the example's own (older) built_at, re-sent by the ingest steps below, must leave this
// text in place. The owner read near the end checks that.
const freshMarker = `Smoke rekomendacja ${Date.now()}`;
const freshSummaryMarker = `Smoke podsumowanie ${Date.now()}`;
// The calendar shows a text only for a completed day or month, and the example's own day row has no narration, so the
// fresh set also carries a narrated entry for yesterday and for the previous Warsaw month, each with its own marker
// (an example entry for the same kind and period is replaced, keeping the (kind, period) pairs unique).
const daySummaryMarker = `Smoke podsumowanie dnia ${Date.now()}`;
// The day's text carries markup on purpose: the page must show it as literal characters, never as HTML.
const daySummaryText = `${daySummaryMarker} <b>pogrubione</b>`;
const monthSummaryMarker = `Smoke podsumowanie miesiąca ${Date.now()}`;
const freshSummaries = () => {
  const now = new Date().toISOString();
  const narrated = (kind, period, text) => ({
    kind,
    period,
    built_at: now,
    facts: { period, complete_days: 7, pv_kwh_total: 12.5, grid_sensor_reliable: false },
    narration: { text, generated_at: now, provider: "openrouter", model: "smoke/synthetic" },
  });
  const own = [narrated("day", summaryDay, daySummaryText), narrated("month", summaryMonth, monthSummaryMarker)];
  const fromExample = examplePeriodSummaries
    .filter((entry) => !own.some((mine) => mine.kind === entry.kind && mine.period === entry.period))
    .map((entry) => ({
      ...entry,
      built_at: now,
      narration: entry.narration
        ? { ...entry.narration, generated_at: now, ...(entry.kind === "today" ? { text: freshSummaryMarker } : {}) }
        : entry.narration,
    }));
  return [...fromExample, ...own];
};
const freshBody = () => ({
  ...example,
  captured_at: new Date(Date.now() - 60_000).toISOString(),
  recommendation: { ...example.recommendation, generated_at: new Date().toISOString(), text: freshMarker },
  bill_forecast: { ...example.bill_forecast, generated_at: new Date().toISOString() },
  period_summaries: freshSummaries(),
});
const freshPush = () => ingest(freshBody());

// The history page opens on the current month or, while it has fewer than 7 complete days, the previous one; the
// current month's label ("wrzesień 2026") is on the page either way, as the heading or the "next month" link.
const currentMonthLabel = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  month: "long",
  year: "numeric",
}).format(new Date());

// Day notes (S-19): yesterday in Warsaw is always a day the calendar can open, so a note can be written on it. Every
// text is synthetic and unique to this run; the owner's flow ends by deleting the note again.
const warsawToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
const noteDay = new Date(Date.parse(`${warsawToday}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const noteDayPath = `/dashboard/history?day=${noteDay}`;
const noteMonthPath = `/dashboard/history?month=${noteDay.slice(0, 7)}`;
// The summaries' day is the same yesterday; their month is the previous Warsaw month (a completed month).
const summaryDay = noteDay;
const summaryMonth = new Date(Date.parse(`${warsawToday.slice(0, 7)}-01T00:00:00Z`) - 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 7);
// The example's own day row has no narration: a completed day the lab has facts for but no text yet (unless this run's
// yesterday happens to be that day, when the fresh set replaces it).
const pendingExample = example.period_summaries.find(
  (entry) => entry.kind === "day" && entry.narration === null && entry.period !== summaryDay,
);
// The hourly card (Godziny zużycia): one complete Warsaw day, 4 days back, so it stays inside the card's 35-day window
// and is a day the card has ended. Every clock hour of the day is pushed (24, or 23 / 25 on a daylight-saving change),
// found with Europe/Warsaw rules: the day's midnight is the UTC midnight minus the Warsaw offset (+1 h or +2 h), and the
// hours run in whole-hour steps until the Warsaw date changes. All figures are invented: the clock hour 20 uses 9.5 kWh
// and every other hour 0.4 to 0.8 kWh, so 20:00 is the day's heaviest hour whatever else the window holds (the card
// ranks hours by house use, highest first, and prints an hour as "HH:00–(HH+1):00"). The same day's keys every run, so a
// rerun overwrites the same values.
const HOUR_MS = 60 * 60 * 1000;
const HEAVIEST_CLOCK_HOUR = 20;
const HEAVIEST_HOUR_LABEL = "20:00–21:00";
const hourlyDay = new Date(Date.parse(`${warsawToday}T00:00:00Z`) - 4 * 24 * HOUR_MS).toISOString().slice(0, 10);
// The card prints the day next to each ranked hour as "D miesiąca, dzień tygodnia" (day without a leading zero and the
// genitive month, e.g. "3 października, sobota"). The day and month are written by hand from `hourlyDay`, so the step
// below cannot pass on an earlier smoke run's day.
const GENITIVE_MONTHS = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
];
const HOURLY_DAY_LABEL = `${Number(hourlyDay.slice(8, 10))} ${GENITIVE_MONTHS[Number(hourlyDay.slice(5, 7)) - 1]}`;
const warsawClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});
const warsawHourAt = (ms) => {
  const parts = Object.fromEntries(warsawClock.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return { dayKey: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
};
const warsawDayHours = (dayKey) => {
  const utcMidnight = Date.parse(`${dayKey}T00:00:00Z`);
  const midnight = [1, 2]
    .map((offsetHours) => utcMidnight - offsetHours * HOUR_MS)
    .find((ms) => warsawHourAt(ms).dayKey === dayKey && warsawHourAt(ms).hour === 0);
  const hours = [];
  for (let ms = midnight; warsawHourAt(ms).dayKey === dayKey; ms += HOUR_MS) {
    hours.push({ startMs: ms, hour: warsawHourAt(ms).hour });
  }
  return hours;
};
const hourlyDayHistory = () =>
  warsawDayHours(hourlyDay).map(({ startMs, hour }) => ({
    hour_start: new Date(startMs).toISOString(),
    load_kwh: hour === HEAVIEST_CLOCK_HOUR ? 9.5 : [0.4, 0.5, 0.6, 0.7, 0.8][hour % 5],
    grid_net_kwh: 0.3,
    pv_kwh: 0.1,
    samples: 12,
  }));
// The fresh push with its hourly history replaced by the complete day. Its captured_at is the real now: later than the
// fresh push's (a minute back) and the script-start push's, and earlier than the pushes the later steps make, so it is
// distinct from all of them (an equal captured_at with different content would be a 409). The state is the fresh push's.
const hourlyPush = () =>
  ingest({ ...freshBody(), captured_at: new Date().toISOString(), hourly_history: hourlyDayHistory() });
const noteStamp = Date.now();
const noteText = `Smoke notatka ${noteStamp} <b>pogrubiona</b>`;
// Astro escapes the text, so the page holds it as literal characters, never as markup.
const noteTextEscaped = `Smoke notatka ${noteStamp} &lt;b&gt;pogrubiona&lt;/b&gt;`;
const editedText = `Smoke notatka ${noteStamp} poprawiona`;
const signedOutText = `Smoke notatka bez sesji ${noteStamp}`;
const crossSiteText = `Smoke notatka z obcej strony ${noteStamp}`;
// A month cell's accessible name ends with this when the day has a note; the legend's entry has no leading comma.
const NOTE_MARKER = ", jest notatka</span>";
const postNote = (form, options = {}) =>
  request("/api/notes", { method: "POST", form: { day: noteDay, ...form }, ...options });

// The smoke matcher compares locations by prefix, so an invalid period's redirect checks the exact location itself:
// "/dashboard/history?month=bad" would also start with "/dashboard/history" (a redirect loop). A mismatch reports 399.
async function historyInvalidPeriod() {
  const result = await request("/dashboard/history?month=bad");
  return result.location === "/dashboard/history" ? result : { ...result, status: 399 };
}

const steps = [
  ["home redirects anonymous user to sign-in", () => request("/"), { status: 302, location: "/auth/signin" }],
  [
    "signed-out note post goes to sign-in",
    () => postNote({ intent: "save", text: signedOutText }),
    { status: 303, location: "/auth/signin" },
  ],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["history redirects anonymous user", () => request("/dashboard/history"), { status: 302, location: "/auth/signin" }],
  ["password sign-up is gone", () => request("/auth/signup"), { status: 404 }],
  [
    "sign-in page has a main landmark and a top-level heading",
    () => request("/auth/signin", { readBody: true }),
    { status: 200, contains: ["<main", "<h1"] },
  ],
  [
    "check-email page has a main landmark and a top-level heading",
    () => request("/auth/check-email", { readBody: true }),
    { status: 200, contains: ["<main", "<h1"] },
  ],
  [
    "home forwards a Supabase code to /auth/confirm",
    () => request("/?code=smoke-code"),
    { status: 302, location: "/auth/confirm?code=smoke-code" },
  ],
  [
    "an unknown code is rejected",
    () => request("/auth/confirm?code=smoke-code"),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "password sign-in rejects a wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong-password" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "sign-in link request rejects an invalid email",
    () => request("/api/auth/magic-link", { method: "POST", form: { email: "not-an-email" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "sign-in link request goes to check-email",
    () => request("/api/auth/magic-link", { method: "POST", form: { email } }),
    { status: 302, location: "/auth/check-email" },
  ],
  ["sign-in email arrives in Mailpit", fetchSigninLink, { status: 200 }],
  ["sign-in link opens a session", () => request(signinLink), { status: 302, location: "/dashboard" }],
  ["home redirects signed-in owner to dashboard", () => request("/"), { status: 302, location: "/dashboard" }],
  ["fresh recommendation is pushed", freshPush, { status: 201 }],
  [
    "dashboard shows the fresh recommendation",
    () => request("/dashboard", { readBody: true }),
    { status: 200, contains: freshMarker, notContains: "Nieaktualna" },
  ],
  [
    "dashboard shows the fresh live state",
    () => request("/dashboard", { readBody: true }),
    { status: 200, contains: ["Stan na żywo", "3,1 kW"], notContains: "Dane nieaktualne" },
  ],
  [
    // The fixture carries only two days of history, so the card shows its heading, not a flag.
    "dashboard shows the usage insight card",
    () => request("/dashboard", { readBody: true }),
    { status: 200, contains: "Zużycie wczoraj", notContains: "Nie udało się wczytać porównania" },
  ],
  [
    // The example's own figures: 155–360 zł around 258. The card is deliberately red here — 257.73 is just
    // over +20% of August's real invoice (214.66) — so the marker is the range, not the verdict.
    "dashboard shows the bill forecast card",
    () => request("/dashboard", { readBody: true }),
    { status: 200, contains: ["Prognoza rachunku", "od 155 zł do 360 zł", "ok. 258 zł"] },
  ],
  [
    // The fresh set's today entry is about the current Warsaw day and built now, so the card reads "aktualna".
    "dashboard shows today's summary card as current, with its text",
    () => request("/dashboard", { readBody: true }),
    {
      status: 200,
      contains: ['data-testid="today-summary"', 'data-testid="today-summary-status"', freshSummaryMarker],
      // "aktualna" is also the recommendation card's badge word, so it must come from the summary card's own badge.
      matches: /data-testid="today-summary-status"[\s\S]{0,1500}?aktualna/,
    },
  ],
  [
    "dashboard has a main landmark and a top-level heading",
    () => request("/dashboard", { readBody: true }),
    { status: 200, contains: ["<main", "<h1"] },
  ],
  ["hourly history of one complete day is pushed", hourlyPush, { status: 201 }],
  [
    // The pushed day makes the hourly card rank hours: the status badge is there, the empty-state reason (rendered only
    // for an empty view) is not, and the heaviest hour of the pushed day (its hour label followed by that day's own label,
    // so an earlier run's day cannot satisfy it) comes right after the "Najwyższe" heading inside the hours block.
    "dashboard shows the hourly card with the heaviest hour of the pushed day",
    () => request("/dashboard", { readBody: true }),
    {
      status: 200,
      contains: ['data-testid="hourly-status"', 'data-testid="hourly-hours"'],
      notContains: 'data-testid="hourly-empty-reason"',
      matches: new RegExp(
        `data-testid="hourly-hours"[\\s\\S]*?Najwyższe[\\s\\S]{0,500}?${HEAVIEST_HOUR_LABEL}[^<]*</span>[^>]*>${HOURLY_DAY_LABEL},`,
      ),
    },
  ],
  [
    "history page has a main landmark, a top-level heading and the current month",
    () => request("/dashboard/history", { readBody: true }),
    { status: 200, contains: ["<main", "<h1", currentMonthLabel] },
  ],
  ["history redirects an invalid period to the default month", historyInvalidPeriod, { status: 302 }],
  [
    "note post from a foreign origin is forbidden",
    () => postNote({ intent: "save", text: crossSiteText }, { origin: "https://evil.example" }),
    { status: 403 },
  ],
  [
    "day page shows yesterday's summary as text, with the panel and its marker",
    () => request(noteDayPath, { readBody: true }),
    {
      status: 200,
      contains: [
        'data-testid="history-day-summary"',
        "Podsumowanie dnia",
        daySummaryMarker,
        "&lt;b&gt;pogrubione&lt;/b&gt;",
      ],
      notContains: "<b>pogrubione</b>",
    },
  ],
  ...(pendingExample
    ? [
        [
          // The lab has this day's facts but no text yet: one neutral sentence, and none of this run's texts.
          "a completed day without a text says so, with no text of this run",
          () => request(`/dashboard/history?day=${pendingExample.period}`, { readBody: true }),
          {
            status: 200,
            contains: ['data-testid="history-day-summary"', "Opis jeszcze się nie pojawił."],
            notContains: [daySummaryMarker, monthSummaryMarker, freshSummaryMarker],
          },
        ],
      ]
    : []),
  [
    "month page shows the previous month's summary as text, with the panel and its marker",
    () => request(`/dashboard/history?month=${summaryMonth}`, { readBody: true }),
    { status: 200, contains: ['data-testid="history-month-summary"', "Podsumowanie miesiąca", monthSummaryMarker] },
  ],
  [
    "today's day view has no summary panel",
    () => request(`/dashboard/history?day=${warsawToday}`, { readBody: true }),
    { status: 200, notContains: ['data-testid="history-day-summary"', daySummaryMarker] },
  ],
  [
    "the current month view has no summary panel",
    () => request(`/dashboard/history?month=${warsawToday.slice(0, 7)}`, { readBody: true }),
    { status: 200, notContains: ['data-testid="history-month-summary"', monthSummaryMarker] },
  ],
  [
    "owner saves a note",
    () => postNote({ intent: "save", text: noteText }),
    { status: 303, location: `${noteDayPath}&note=saved` },
  ],
  [
    "day page shows the saved note as text, and no rejected one",
    () => request(`${noteDayPath}&note=saved`, { readBody: true }),
    {
      status: 200,
      contains: ['data-testid="history-day-note"', noteTextEscaped, "Notatka zapisana.", 'role="status"'],
      notContains: [`<b>pogrubiona</b>`, signedOutText, crossSiteText],
    },
  ],
  [
    "month page marks the noted day",
    () => request(noteMonthPath, { readBody: true }),
    { status: 200, contains: NOTE_MARKER },
  ],
  [
    "owner edits the note",
    () => postNote({ intent: "save", text: editedText }),
    { status: 303, location: `${noteDayPath}&note=saved` },
  ],
  [
    "day page shows the edited note",
    () => request(noteDayPath, { readBody: true }),
    { status: 200, contains: editedText, notContains: noteTextEscaped },
  ],
  [
    "a blank note is rejected",
    () => postNote({ intent: "save", text: "   " }),
    { status: 303, location: `${noteDayPath}&note=invalid` },
  ],
  [
    "owner deletes the note",
    () => postNote({ intent: "delete" }),
    { status: 303, location: `${noteDayPath}&note=deleted` },
  ],
  [
    "day page no longer shows the note",
    () => request(`${noteDayPath}&note=deleted`, { readBody: true }),
    { status: 200, contains: ["Notatka usunięta.", "Dodaj notatkę"], notContains: editedText },
  ],
  [
    "month page no longer marks the day",
    () => request(noteMonthPath, { readBody: true }),
    { status: 200, notContains: NOTE_MARKER },
  ],
  ["used sign-in link is rejected", () => request(signinLink), { status: 302, location: "/auth/signin?error=" }],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

// Polls Mailpit for this run's email and extracts the /auth/confirm link (200 once found).
async function fetchSigninLink() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages = [] } = await search.json();
    if (messages.length) {
      const message = await (await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)).json();
      const href = /href="([^"]*\/auth\/confirm\?[^"]*)"/.exec(message.HTML)?.[1];
      if (!href) return { status: 422, location: "email has no /auth/confirm link" };
      signinLink = href.replaceAll("&amp;", "&");
      return { status: 200, location: "" };
    }
    await sleep(500);
  }
  return { status: 404, location: "no email within 10 s" };
}

// Machine push: no cookies and no Origin header, like the home lab.
async function ingest(body, token = INGEST_TOKEN) {
  const response = await fetch(`${BASE_URL}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: response.status, location: "" };
}

// The example's own today entry is dated 2026-09-23; the dashboard card shows the newest today row as current only when it
// is about the current Warsaw day, so every push of the example here carries today's key (the same row each time).
const examplePeriodSummaries = example.period_summaries.map((entry) =>
  entry.kind === "today" ? { ...entry, period: warsawToday } : entry,
);
const payload = { ...example, period_summaries: examplePeriodSummaries, captured_at: new Date().toISOString() };
const changed = { ...payload, state: { ...payload.state, pv_w: (payload.state.pv_w ?? 0) + 1 } };

steps.push(
  ["ingest rejects a missing token", () => ingest(payload, null), { status: 401 }],
  ["ingest rejects a wrong token", () => ingest(payload, "wrong-token"), { status: 401 }],
  ["ingest stores a new push without an Origin header", () => ingest(payload), { status: 201 }],
  ["ingest accepts an identical re-send as duplicate", () => ingest(payload), { status: 200 }],
  ["ingest rejects changed content at the same capture time", () => ingest(changed), { status: 409 }],
  ["ingest rejects unknown fields", () => ingest({ ...payload, customer_id: "x" }), { status: 422 }],
  ["ingest rejects an oversized body", () => ingest(" ".repeat(300 * 1024)), { status: 413 }],
);

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  steps.push([
    "anon cannot read ingested pushes directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/ingest_pushes?select=id`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
  steps.push([
    "anon cannot read recommendations directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/recommendations?select=text`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
  steps.push([
    "anon cannot read live state directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/live_state?select=state`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
  steps.push([
    "anon cannot read daily energy directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/daily_energy?select=day`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
  steps.push([
    "anon cannot read day notes directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/day_notes?select=day,text`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
  steps.push([
    "anon cannot write day notes directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/day_notes`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ day: noteDay, text: `Smoke notatka anonimowa ${noteStamp}` }),
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
  steps.push([
    "anon cannot read bill forecast directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/bill_forecast?select=bill_forecast`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
  steps.push([
    "anon cannot read period summaries directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/period_summaries?select=kind,period,narration_text`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
  // Password alternative: create a local user with a password through Supabase, then sign in via the app.
  const passwordEmail = `smoke-pw-${Date.now()}@example.com`;
  const passwordValue = "Smoke-Test-Passw0rd!";
  // Signed-in REST read as the password user; returns the status and, with readBody, the parsed JSON rows.
  const ownerRead = async (path, { readBody = false } = {}) => {
    const session = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: passwordEmail, password: passwordValue }),
    }).then((response) => response.json());
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${String(session.access_token)}` },
    });
    return { status: response.status, location: "", rows: readBody ? await response.json() : undefined };
  };
  steps.push(
    [
      "local password user is created",
      async () => {
        const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
          method: "POST",
          headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email: passwordEmail, password: passwordValue }),
        });
        return { status: response.status, location: "" };
      },
      { status: 200 },
    ],
    [
      // Column grants: even a signed-in owner (every local user is one) can't read the token or hash columns.
      "signed-in user cannot read push token columns",
      () => ownerRead("ingest_pushes?select=token_id,payload_hash"),
      { status: 403 },
    ],
    [
      // RLS filtering everything out is still a 200 with an empty list, so require the fixture's daily rows
      // (the ingest steps above wrote two); an empty list reports 299.
      "signed-in owner can read daily energy totals",
      async () => {
        const result = await ownerRead("daily_energy?select=day,load_kwh,grid_import_kwh", { readBody: true });
        const empty = result.status === 200 && !(Array.isArray(result.rows) && result.rows.length >= 1);
        return empty ? { status: 299, location: "no daily rows visible" } : result;
      },
      { status: 200 },
    ],
    [
      "signed-in owner cannot read daily energy push_id",
      () => ownerRead("daily_energy?select=push_id"),
      { status: 403 },
    ],
    [
      // The example's three (kind, period) rows must all be there, and the today text must still be this run's fresh
      // one: the ingest steps above re-sent the example with its older built_at, which must not replace it. A missing
      // row reports 299, a replaced text 298.
      "signed-in owner reads the period summaries, and an older built_at did not replace them",
      async () => {
        const result = await ownerRead("period_summaries?select=kind,period,narration_text,built_at", {
          readBody: true,
        });
        if (result.status !== 200 || !Array.isArray(result.rows)) return result;
        const rows = examplePeriodSummaries.map((entry) =>
          result.rows.find((row) => row.kind === entry.kind && row.period === entry.period),
        );
        if (rows.some((row) => row === undefined)) return { status: 299, location: "example summary rows missing" };
        const today = rows.find((row) => row.kind === "today");
        return today.narration_text === freshSummaryMarker
          ? result
          : { status: 298, location: "today summary replaced by an older built_at" };
      },
      { status: 200 },
    ],
    [
      "signed-in owner cannot read period summaries push_id",
      () => ownerRead("period_summaries?select=push_id"),
      { status: 403 },
    ],
    [
      // A newer facts-only entry (narration null, as when the cloud model failed or the lab lost its state file) for
      // the narrated today row: built_at is later than the fresh one, so only the narration rule keeps the text.
      "ingest stores a newer facts-only entry for a narrated period",
      () => {
        const now = new Date().toISOString();
        const today = examplePeriodSummaries.find((entry) => entry.kind === "today");
        return ingest({
          ...example,
          captured_at: now,
          period_summaries: [{ ...today, built_at: now, narration: null }],
        });
      },
      { status: 201 },
    ],
    [
      // A newer entry without a narration never clears a stored narration: the today text must still be this run's
      // fresh one. A missing row reports 299, a cleared or replaced text 298.
      "signed-in owner still reads the narration after a newer facts-only entry",
      async () => {
        const result = await ownerRead("period_summaries?select=kind,period,narration_text", { readBody: true });
        if (result.status !== 200 || !Array.isArray(result.rows)) return result;
        const todayPeriod = examplePeriodSummaries.find((entry) => entry.kind === "today").period;
        const today = result.rows.find((row) => row.kind === "today" && row.period === todayPeriod);
        if (today === undefined) return { status: 299, location: "today summary row missing" };
        return today.narration_text === freshSummaryMarker
          ? result
          : { status: 298, location: "today narration cleared by a newer facts-only entry" };
      },
      { status: 200 },
    ],
    [
      "password sign-in opens a session",
      () => request("/api/auth/signin", { method: "POST", form: { email: passwordEmail, password: passwordValue } }),
      { status: 302, location: "/dashboard" },
    ],
    ["dashboard renders after password sign-in", () => request("/dashboard"), { status: 200 }],
    ["signout after password sign-in", () => request("/api/auth/signout", { method: "POST" }), { status: 302 }],
  );
} else {
  console.log("SKIP  anon direct-table and password checks (SUPABASE_URL / SUPABASE_ANON_KEY not set)");
}

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    [expected.contains ?? []].flat().every((text) => Boolean(actual.body?.includes(text))) &&
    [expected.notContains ?? []].flat().every((text) => !actual.body?.includes(text)) &&
    (expected.matches === undefined || expected.matches.test(actual.body ?? ""));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
