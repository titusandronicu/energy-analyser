import { beforeAll, describe, expect, it } from "vitest";
import { loadDailyRange } from "@/lib/services/calendar-data";
import { asRecord } from "@/lib/format/values";
import { loadLiveState } from "@/lib/services/live-state";
import { baseBody, dailyRow, hourRow, recommendation, summary } from "./support/bodies";
import { emptySummaryDay, freshDays, freshWindowHours, nextCapturedAt, olderCapturedAt } from "./support/keys";
import { push } from "./support/push";
import { ownerClient, requireStack } from "./support/stack";

// Golden replay of the whole push boundary: one scripted sequence of multi-section pushes through the real handleIngest
// and the real ingest_push, with the stored rows of EVERY section read back after each step and compared with literals
// written here (from supabase/migrations/20261001113911_period_summaries_keep_narration.sql and docs/logic.md). The
// single-section rules are pinned one by one in history-safety.test.ts; this file pins what they do together, and the
// period summary rules (built_at order, narration kept) that nothing else covers. A later phase that moves the
// boundary must leave every step below unchanged. Only keys this run draws are read, so reruns on the shared database
// do not collide.

type Owner = Awaited<ReturnType<typeof ownerClient>>;

const CREATED = { status: 201, body: { status: "created" } };
const DUPLICATE = { status: 200, body: { status: "duplicate" } };
const CONFLICT = { status: 409, body: { error: "capture time conflict" } };

// Postgres hands timestamptz back as "...+00:00"; compare instants, not spellings.
const instant = (value: string | null | undefined): number => Date.parse(value ?? "");
const iso = (value: string): string => new Date(value).toISOString();

interface StoredHour {
  hour_start: string;
  load_kwh: number | null;
  grid_net_kwh: number | null;
  pv_kwh: number | null;
  samples: number;
}

interface StoredSummaryRow {
  kind: string;
  facts: unknown;
  narration_text: string | null;
  narration_generated_at: string | null;
  narration_provider: string | null;
  narration_model: string | null;
  built_at: string;
}

// One summary row as the test compares it: facts, narration (null when there is none) and the entry's built_at.
interface SummaryState {
  facts: unknown;
  narration: { text: string; generated: number; provider: string | null; model: string | null } | null;
  built: number;
}

// Everything the owner can read about the keys this test owns, after one step.
interface Stored {
  live: { at: number; pv_w: unknown };
  daily: Awaited<ReturnType<typeof loadDailyRange>>;
  hours: StoredHour[];
  summaries: { day: SummaryState | undefined; today: SummaryState | undefined };
  recs: { at: number; text: string }[];
}

describe("ingest golden replay: a scripted sequence of multi-section pushes", () => {
  let owner: Owner;

  beforeAll(async () => {
    requireStack();
    owner = await ownerClient();
  });

  it("stores, keeps and replaces every section exactly as the current store does", async () => {
    // The keys this test owns: one daily row, two window hours, one summary period (read as kinds "day" and "today"),
    // and the recommendation times.
    const [day] = await freshDays(owner, 1);
    const [hour1, hour2] = await freshWindowHours(owner, 2);
    const period = await emptySummaryDay(owner);
    const genOlder = olderCapturedAt();
    const gen1 = nextCapturedAt();
    const gen2 = nextCapturedAt();
    const genRefused = nextCapturedAt();
    // Capture times in strictly increasing order; `tOlder` is older than all of them.
    const tOlder = olderCapturedAt();
    const t1 = nextCapturedAt();
    const t2 = nextCapturedAt();
    const t3 = nextCapturedAt();
    const t4 = nextCapturedAt();
    const t5 = nextCapturedAt();

    // built_at of the summary entries, one minute apart and ascending with the index.
    const base = Date.now() - 10 * 60_000;
    const built = [0, 1, 2, 3, 4, 5].map((n) => new Date(base + n * 60_000));
    const builtMs = built.map((date) => date.getTime());
    const entry = (kind: "day" | "today", n: number, figure: number, text: string | null) =>
      summary(kind, period, {
        built_at: built[n].toISOString(),
        facts: { figure },
        narration:
          text === null
            ? null
            : { text, generated_at: built[n].toISOString(), provider: "openrouter", model: "invented-model" },
      });
    const narrated = (text: string, n: number, figure: number): SummaryState => ({
      facts: { figure },
      narration: { text, generated: builtMs[n], provider: "openrouter", model: "invented-model" },
      built: builtMs[n],
    });
    const factsOnly = (n: number, figure: number): SummaryState => ({
      facts: { figure },
      narration: null,
      built: builtMs[n],
    });

    async function readStored(): Promise<Stored> {
      const live = await loadLiveState(owner);

      const dailyRows = await loadDailyRange(owner, day, day);

      const hourResult = await owner
        .from("hourly_energy")
        .select("hour_start, load_kwh, grid_net_kwh, pv_kwh, samples")
        .in("hour_start", [hour1, hour2])
        .order("hour_start", { ascending: true })
        .overrideTypes<StoredHour[], { merge: false }>();
      if (hourResult.error) throw new Error(`reading hourly_energy failed: ${hourResult.error.message}`);

      const summaryResult = await owner
        .from("period_summaries")
        .select("kind, facts, narration_text, narration_generated_at, narration_provider, narration_model, built_at")
        .eq("period", period)
        .overrideTypes<StoredSummaryRow[], { merge: false }>();
      if (summaryResult.error) throw new Error(`reading period_summaries failed: ${summaryResult.error.message}`);
      const summaryOf = (kind: string): SummaryState | undefined => {
        const row = summaryResult.data.find((candidate) => candidate.kind === kind);
        if (!row) return undefined;
        return {
          facts: row.facts,
          narration:
            row.narration_text === null
              ? null
              : {
                  text: row.narration_text,
                  generated: instant(row.narration_generated_at),
                  provider: row.narration_provider,
                  model: row.narration_model,
                },
          built: instant(row.built_at),
        };
      };

      const recResult = await owner
        .from("recommendations")
        .select("generated_at, text")
        .in(
          "generated_at",
          [genOlder, gen1, gen2, genRefused].map((date) => date.toISOString()),
        )
        .order("generated_at", { ascending: true })
        .overrideTypes<{ generated_at: string; text: string }[], { merge: false }>();
      if (recResult.error) throw new Error(`reading recommendations failed: ${recResult.error.message}`);

      return {
        live: { at: instant(live?.captured_at), pv_w: asRecord(live?.state).pv_w },
        daily: dailyRows,
        hours: hourResult.data.map((row) => ({ ...row, hour_start: iso(row.hour_start) })),
        summaries: { day: summaryOf("day"), today: summaryOf("today") },
        recs: recResult.data.map((row) => ({ at: instant(row.generated_at), text: row.text })),
      };
    }

    // Step 1: a first push carrying every section stores all of them.
    expect(
      await push({
        ...baseBody(t1, { pv_w: 2100 }),
        daily_history: [dailyRow(day, { load_kwh: 10.4, pv_forecast_kwh: 20 })],
        hourly_history: [
          hourRow(hour1, { load_kwh: 0.6, grid_net_kwh: 0.2, pv_kwh: 0.3, samples: 12 }),
          hourRow(hour2, { load_kwh: 0.7, grid_net_kwh: 0.1, pv_kwh: 0.2, samples: 12 }),
        ],
        period_summaries: [entry("day", 1, 1, "Invented first day text"), entry("today", 1, 1, null)],
        recommendation: recommendation(gen1, { text: "Invented advice one" }),
      }),
    ).toEqual(CREATED);
    const stored1 = await readStored();
    expect(stored1).toEqual({
      live: { at: t1.getTime(), pv_w: 2100 },
      daily: [{ day, pv_kwh: 7.5, load_kwh: 10.4, grid_import_kwh: 3, grid_export_kwh: 1.5, pv_forecast_kwh: 20 }],
      hours: [
        { hour_start: hour1, load_kwh: 0.6, grid_net_kwh: 0.2, pv_kwh: 0.3, samples: 12 },
        { hour_start: hour2, load_kwh: 0.7, grid_net_kwh: 0.1, pv_kwh: 0.2, samples: 12 },
      ],
      summaries: { day: narrated("Invented first day text", 1, 1), today: factsOnly(1, 1) },
      recs: [{ at: gen1.getTime(), text: "Invented advice one" }],
    });

    // Step 2: the identical body again is a duplicate and changes no section.
    expect(
      await push({
        ...baseBody(t1, { pv_w: 2100 }),
        daily_history: [dailyRow(day, { load_kwh: 10.4, pv_forecast_kwh: 20 })],
        hourly_history: [
          hourRow(hour1, { load_kwh: 0.6, grid_net_kwh: 0.2, pv_kwh: 0.3, samples: 12 }),
          hourRow(hour2, { load_kwh: 0.7, grid_net_kwh: 0.1, pv_kwh: 0.2, samples: 12 }),
        ],
        period_summaries: [entry("day", 1, 1, "Invented first day text"), entry("today", 1, 1, null)],
        recommendation: recommendation(gen1, { text: "Invented advice one" }),
      }),
    ).toEqual(DUPLICATE);
    expect(await readStored()).toEqual(stored1);

    // Step 3: the same captured_at with different content in every section is refused whole: nothing of it is stored,
    // not even the recommendation with a generated_at of its own.
    expect(
      await push({
        ...baseBody(t1, { pv_w: 9100 }),
        daily_history: [dailyRow(day, { load_kwh: 77.7 })],
        hourly_history: [hourRow(hour1, { load_kwh: 0.9, samples: 5 }), hourRow(hour2, { load_kwh: 0.9, samples: 5 })],
        period_summaries: [entry("day", 5, 5, "Invented refused text"), entry("today", 5, 5, "Invented refused text")],
        recommendation: recommendation(genRefused, { text: "Invented refused advice" }),
      }),
    ).toEqual(CONFLICT);
    expect(await readStored()).toEqual(stored1);

    // Step 4: an older late push (older captured_at, older built_at) changes the daily, hourly, summary and live
    // sections not at all. The recommendation is keyed by its generated_at, not ordered by capture time, so an unseen
    // generated_at is stored as a row of its own while the stored ones stay as they were.
    expect(
      await push({
        ...baseBody(tOlder, { pv_w: 4400 }),
        daily_history: [dailyRow(day, { pv_kwh: 1, load_kwh: 99, grid_import_kwh: 9, grid_export_kwh: 9 })],
        hourly_history: [hourRow(hour1, { load_kwh: 0.55, samples: 3 }), hourRow(hour2, { load_kwh: 0.5, samples: 3 })],
        period_summaries: [entry("day", 0, 0, "Invented older day text"), entry("today", 0, 0, null)],
        recommendation: recommendation(genOlder, { text: "Invented advice zero" }),
      }),
    ).toEqual(CREATED);
    expect(await readStored()).toEqual({
      ...stored1,
      recs: [
        { at: genOlder.getTime(), text: "Invented advice zero" },
        { at: gen1.getTime(), text: "Invented advice one" },
      ],
    });

    // Step 5: a newer push changes every section. The daily push omits pv_forecast_kwh, so the stored 20 stays; the
    // day summary is narrated and replaces the row, the today summary is facts-only and replaces a facts-only row.
    expect(
      await push({
        ...baseBody(t2, { pv_w: 3300 }),
        daily_history: [dailyRow(day, { pv_kwh: 8.1, load_kwh: 12.1, grid_import_kwh: 2.5, grid_export_kwh: 2.2 })],
        hourly_history: [
          hourRow(hour1, { load_kwh: 0.65, grid_net_kwh: 0.25, pv_kwh: 0.35, samples: 12 }),
          hourRow(hour2, { load_kwh: 0.75, grid_net_kwh: 0.15, pv_kwh: 0.25, samples: 11 }),
        ],
        period_summaries: [entry("day", 2, 2, "Invented second day text"), entry("today", 2, 2, null)],
        recommendation: recommendation(gen2, { text: "Invented advice two" }),
      }),
    ).toEqual(CREATED);
    const stored5 = await readStored();
    expect(stored5).toEqual({
      live: { at: t2.getTime(), pv_w: 3300 },
      daily: [{ day, pv_kwh: 8.1, load_kwh: 12.1, grid_import_kwh: 2.5, grid_export_kwh: 2.2, pv_forecast_kwh: 20 }],
      hours: [
        { hour_start: hour1, load_kwh: 0.65, grid_net_kwh: 0.25, pv_kwh: 0.35, samples: 12 },
        { hour_start: hour2, load_kwh: 0.75, grid_net_kwh: 0.15, pv_kwh: 0.25, samples: 11 },
      ],
      summaries: { day: narrated("Invented second day text", 2, 2), today: factsOnly(2, 2) },
      recs: [
        { at: genOlder.getTime(), text: "Invented advice zero" },
        { at: gen1.getTime(), text: "Invented advice one" },
        { at: gen2.getTime(), text: "Invented advice two" },
      ],
    });

    // Step 6: a newer narration-less day entry is skipped whole (stored facts and text stay), while a newer narrated
    // today entry replaces the facts-only row. Daily, state and one hour move on; the other hour and the
    // recommendations stay.
    expect(
      await push({
        ...baseBody(t3, { pv_w: 3400 }),
        daily_history: [dailyRow(day, { pv_kwh: 8.4, load_kwh: 13, grid_import_kwh: 2.6, grid_export_kwh: 2.4 })],
        hourly_history: [hourRow(hour1, { load_kwh: 0.8, grid_net_kwh: 0.3, pv_kwh: 0.4, samples: 12 })],
        period_summaries: [entry("day", 3, 3, null), entry("today", 3, 3, "Invented today text")],
      }),
    ).toEqual(CREATED);
    const stored6 = await readStored();
    expect(stored6).toEqual({
      live: { at: t3.getTime(), pv_w: 3400 },
      daily: [{ day, pv_kwh: 8.4, load_kwh: 13, grid_import_kwh: 2.6, grid_export_kwh: 2.4, pv_forecast_kwh: 20 }],
      hours: [
        { hour_start: hour1, load_kwh: 0.8, grid_net_kwh: 0.3, pv_kwh: 0.4, samples: 12 },
        { hour_start: hour2, load_kwh: 0.75, grid_net_kwh: 0.15, pv_kwh: 0.25, samples: 11 },
      ],
      summaries: { day: narrated("Invented second day text", 2, 2), today: narrated("Invented today text", 3, 3) },
      recs: stored5.recs,
    });

    // Step 7: a newer narrated day entry replaces the row; an older narrated today entry (built_at before the stored
    // one) does not. Only the live state moves among the other sections.
    expect(
      await push({
        ...baseBody(t4, { pv_w: 3500 }),
        period_summaries: [
          entry("day", 4, 4, "Invented third day text"),
          entry("today", 1, 9, "Invented stale today text"),
        ],
      }),
    ).toEqual(CREATED);
    const stored7 = await readStored();
    expect(stored7).toEqual({
      ...stored6,
      live: { at: t4.getTime(), pv_w: 3500 },
      summaries: { day: narrated("Invented third day text", 4, 4), today: narrated("Invented today text", 3, 3) },
    });

    // Step 8: an older narrated day entry does not replace the row, and a newer narration-less today entry does not
    // clear the stored narration.
    expect(
      await push({
        ...baseBody(t5, { pv_w: 3600 }),
        period_summaries: [entry("day", 0, 8, "Invented late day text"), entry("today", 5, 8, null)],
      }),
    ).toEqual(CREATED);
    expect(await readStored()).toEqual({ ...stored7, live: { at: t5.getTime(), pv_w: 3600 } });
  });
});
