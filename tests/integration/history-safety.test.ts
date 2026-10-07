import { HOUR_MS } from "@/lib/format/age";
import { beforeAll, describe, expect, it } from "vitest";
import { loadDailyRange } from "@/lib/services/calendar-data";
import { dailySeries } from "@/lib/services/daily-series";
import { loadHourlyEnergy, toHourlyUsageView } from "@/lib/services/hourly-usage";
import { loadLiveState } from "@/lib/services/live-state";
import { loadPeriodSummary } from "@/lib/services/period-summary";
import { loadLatestRecommendation } from "@/lib/services/recommendation";
import { baseBody, dailyRow, hourRow, recommendation, summary } from "./support/bodies";
import {
  emptySummaryDay,
  emptyWeek,
  freshDays,
  freshWindowHours,
  nextCapturedAt,
  olderCapturedAt,
} from "./support/keys";
import { push } from "./support/push";
import { ownerClient, requireStack } from "./support/stack";
import { warsawDayBefore, warsawDayHours } from "./support/warsaw-day";

// Risk #4: replays and disorder never downgrade stored data, a gap stays a gap, and retention removes only what it
// should. Each test seeds its own first state on keys of its own, compares with literals written here, and carries a
// control (a newer push does change the row) so a store that ignored every push could not pass. The three holes the
// store leaves open are pinned by the tests whose names start with "KNOWN GAP".

type Owner = Awaited<ReturnType<typeof ownerClient>>;

const CREATED = { status: 201, body: { status: "created" } };
const DUPLICATE = { status: 200, body: { status: "duplicate" } };
const CONFLICT = { status: 409, body: { error: "capture time conflict" } };

// Postgres hands timestamptz back as "...+00:00"; compare instants, not spellings.
const instant = (value: string | null | undefined): number => Date.parse(value ?? "");
const iso = (value: string): string => new Date(value).toISOString();
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

interface StoredHour {
  hour_start: string;
  load_kwh: number | null;
  grid_net_kwh: number | null;
  pv_kwh: number | null;
  samples: number;
}

describe("history safety: replay, order, gaps and the hourly prune", () => {
  let owner: Owner;

  beforeAll(async () => {
    requireStack();
    owner = await ownerClient();
  });

  // The day's row as the owner's loader returns it.
  async function dayRows(day: string) {
    return loadDailyRange(owner, day, day);
  }

  // The stored rows of these hours, read straight from the table (captured_at is not readable by owners), ascending.
  async function storedHours(hours: string[]): Promise<StoredHour[]> {
    const { data, error } = await owner
      .from("hourly_energy")
      .select("hour_start, load_kwh, grid_net_kwh, pv_kwh, samples")
      .in("hour_start", hours)
      .order("hour_start", { ascending: true })
      .overrideTypes<StoredHour[], { merge: false }>();
    if (error) throw new Error(`reading hourly_energy failed: ${error.message}`);
    return data.map((row) => ({ ...row, hour_start: iso(row.hour_start) }));
  }

  describe("replay and order", () => {
    it("an exact duplicate changes nothing and changed content at the same captured_at is refused", async () => {
      const [day] = await freshDays(owner, 1);
      const capturedAt = nextCapturedAt();
      const body = { ...baseBody(capturedAt, { pv_w: 2210 }), daily_history: [dailyRow(day, { load_kwh: 10.4 })] };
      const firstRow = {
        day,
        pv_kwh: 7.5,
        load_kwh: 10.4,
        grid_import_kwh: 3,
        grid_export_kwh: 1.5,
        pv_forecast_kwh: null,
      };

      expect(await push(body)).toEqual(CREATED);
      expect(await dayRows(day)).toEqual([firstRow]);

      // The same body again: accepted as a duplicate, the row is the same.
      expect(await push(body)).toEqual(DUPLICATE);
      expect(await dayRows(day)).toEqual([firstRow]);

      // The same captured_at with a different total: refused, the first value survives.
      const changed = { ...baseBody(capturedAt, { pv_w: 2210 }), daily_history: [dailyRow(day, { load_kwh: 77.7 })] };
      expect(await push(changed)).toEqual(CONFLICT);
      expect(await dayRows(day)).toEqual([firstRow]);

      // Exactly one raw push is kept at that captured_at, and it is the first one.
      const { data, error } = await owner
        .from("ingest_pushes")
        .select("source, captured_at, received_at, payload")
        .eq("source", "homelab")
        .eq("captured_at", capturedAt.toISOString())
        .overrideTypes<
          {
            source: string;
            captured_at: string;
            received_at: string;
            payload: { daily_history: { load_kwh: number }[] };
          }[],
          { merge: false }
        >();
      expect(error).toBeNull();
      expect(
        (data ?? []).map((row) => ({
          source: row.source,
          at: instant(row.captured_at),
          load: row.payload.daily_history[0].load_kwh,
        })),
      ).toEqual([{ source: "homelab", at: capturedAt.getTime(), load: 10.4 }]);

      // Control: a newer push does change the row.
      expect(await push({ ...baseBody(nextCapturedAt()), daily_history: [dailyRow(day, { load_kwh: 12.1 })] })).toEqual(
        CREATED,
      );
      expect(await dayRows(day)).toEqual([{ ...firstRow, load_kwh: 12.1 }]);
    });

    it("an older daily push cannot replace a newer one", async () => {
      const [day] = await freshDays(owner, 1);
      const row = { day, pv_kwh: 7.5, load_kwh: 10, grid_import_kwh: 3, grid_export_kwh: 1.5, pv_forecast_kwh: null };

      // N: the newer capture, total 10.
      expect(await push({ ...baseBody(nextCapturedAt()), daily_history: [dailyRow(day, { load_kwh: 10 })] })).toEqual(
        CREATED,
      );
      // O: an older capture of the same day with total 99 is accepted but must not win.
      expect(await push({ ...baseBody(olderCapturedAt()), daily_history: [dailyRow(day, { load_kwh: 99 })] })).toEqual(
        CREATED,
      );
      expect(await dayRows(day)).toEqual([row]);

      // Control: a push newer than N does change it.
      expect(await push({ ...baseBody(nextCapturedAt()), daily_history: [dailyRow(day, { load_kwh: 12 })] })).toEqual(
        CREATED,
      );
      expect(await dayRows(day)).toEqual([{ ...row, load_kwh: 12 }]);
    });

    it("an older hourly push cannot replace a newer one", async () => {
      const [hour] = await freshWindowHours(owner, 1);
      // hourRow defaults: grid_net 0.2, pv 0.3, 12 samples.
      const stored = { hour_start: hour, load_kwh: 0.6, grid_net_kwh: 0.2, pv_kwh: 0.3, samples: 12 };

      expect(await push({ ...baseBody(nextCapturedAt()), hourly_history: [hourRow(hour, { load_kwh: 0.6 })] })).toEqual(
        CREATED,
      );
      expect(
        await push({ ...baseBody(olderCapturedAt()), hourly_history: [hourRow(hour, { load_kwh: 0.55 })] }),
      ).toEqual(CREATED);
      expect(await storedHours([hour])).toEqual([stored]);

      // Control: a push newer than N does change it.
      expect(await push({ ...baseBody(nextCapturedAt()), hourly_history: [hourRow(hour, { load_kwh: 0.7 })] })).toEqual(
        CREATED,
      );
      expect(await storedHours([hour])).toEqual([{ ...stored, load_kwh: 0.7 }]);
    });

    it("an older state push does not become the live state", async () => {
      const newerAt = nextCapturedAt();
      expect(await push(baseBody(newerAt, { pv_w: 2310 }))).toEqual(CREATED);

      expect(await push(baseBody(olderCapturedAt(), { pv_w: 4410 }))).toEqual(CREATED);
      const live = await loadLiveState(owner);
      expect(instant(live?.captured_at)).toBe(newerAt.getTime());
      expect(live?.state).toMatchObject({ pv_w: 2310 });

      // Control: a push newer than N does become the live state.
      const latestAt = nextCapturedAt();
      expect(await push(baseBody(latestAt, { pv_w: 1710 }))).toEqual(CREATED);
      const latest = await loadLiveState(owner);
      expect(instant(latest?.captured_at)).toBe(latestAt.getTime());
      expect(latest?.state).toMatchObject({ pv_w: 1710 });
    });

    it("keeps pv_forecast_kwh when a newer push omits it and replaces it when a newer push carries one", async () => {
      const [day] = await freshDays(owner, 1);
      const row = { day, pv_kwh: 7.5, load_kwh: 10, grid_import_kwh: 3, grid_export_kwh: 1.5 };

      expect(
        await push({ ...baseBody(nextCapturedAt()), daily_history: [dailyRow(day, { pv_forecast_kwh: 20 })] }),
      ).toEqual(CREATED);
      expect(await dayRows(day)).toEqual([{ ...row, pv_forecast_kwh: 20 }]);

      // A newer push without a forecast changes the total (so the row did update) and keeps the forecast.
      expect(await push({ ...baseBody(nextCapturedAt()), daily_history: [dailyRow(day, { load_kwh: 11 })] })).toEqual(
        CREATED,
      );
      expect(await dayRows(day)).toEqual([{ ...row, load_kwh: 11, pv_forecast_kwh: 20 }]);

      // A newer push that carries a forecast replaces it.
      expect(
        await push({
          ...baseBody(nextCapturedAt()),
          daily_history: [dailyRow(day, { load_kwh: 12, pv_forecast_kwh: 25 })],
        }),
      ).toEqual(CREATED);
      expect(await dayRows(day)).toEqual([{ ...row, load_kwh: 12, pv_forecast_kwh: 25 }]);
    });

    it("a second generated_at creates a second recommendation and the newer one is the latest", async () => {
      const firstAt = nextCapturedAt();
      const secondAt = nextCapturedAt();
      const firstText = `Invented advice one ${String(firstAt.getTime())}: wash at noon.`;
      const secondText = `Invented advice two ${String(secondAt.getTime())}: wash after sunset.`;

      expect(
        await push({ ...baseBody(nextCapturedAt()), recommendation: recommendation(firstAt, { text: firstText }) }),
      ).toEqual(CREATED);
      expect(
        await push({ ...baseBody(nextCapturedAt()), recommendation: recommendation(secondAt, { text: secondText }) }),
      ).toEqual(CREATED);

      // Both rows exist, each with its own text.
      const { data, error } = await owner
        .from("recommendations")
        .select("generated_at, text")
        .in("generated_at", [firstAt.toISOString(), secondAt.toISOString()])
        .order("generated_at", { ascending: true })
        .overrideTypes<{ generated_at: string; text: string }[], { merge: false }>();
      expect(error).toBeNull();
      expect((data ?? []).map((row) => ({ at: instant(row.generated_at), text: row.text }))).toEqual([
        { at: firstAt.getTime(), text: firstText },
        { at: secondAt.getTime(), text: secondText },
      ]);

      // The page shows the newer one.
      const latest = await loadLatestRecommendation(owner);
      expect(latest?.text).toBe(secondText);
      expect(instant(latest?.generated_at)).toBe(secondAt.getTime());
    });
  });

  describe("gaps stay gaps and the hourly prune", () => {
    it("a day nobody pushed stays a gap between two pushed days, never a zero", async () => {
      const week = await emptyWeek(owner);
      const [first, between, third] = week;

      expect(
        await push({
          ...baseBody(nextCapturedAt()),
          daily_history: [dailyRow(first, { load_kwh: 8.8 }), dailyRow(third, { load_kwh: 9.2 })],
        }),
      ).toEqual(CREATED);

      // Exactly the two pushed days; the day between them has no row.
      const rows = await loadDailyRange(owner, first, third);
      expect(rows.map((row) => row.day)).toEqual([first, third]);
      expect(rows.map((row) => row.load_kwh)).toEqual([8.8, 9.2]);
      expect(rows.some((row) => row.day === between)).toBe(false);

      // docs/logic.md "Gaps, never zeros": the slot between keeps its place as null.
      expect(dailySeries(rows, "load_kwh", third, 3)).toEqual([8.8, null, 9.2]);
    });

    // A complete Warsaw day seven days back (never smoke's, four days back), inside the 35-day window. Every load is at
    // or below 1 kWh, so smoke's 9.5 kWh hour stays the heaviest on the dashboard. The clock hour 13 is the heaviest
    // of the day at 0.95 kWh (plus the run's shift of at most 0.049, so at most 0.999); every other hour is 0.40 to 0.80
    // (+ shift).
    it("an hour with fewer than 10 samples leaves its day incomplete, and with 10 samples the day is ranked", async () => {
      const day = warsawDayBefore(new Date(), 7);
      const clock = warsawDayHours(day);
      const heaviestHour = 13;
      const heaviest = clock.find((entry) => entry.hour === heaviestHour);
      if (!heaviest) throw new Error(`no clock hour ${String(heaviestHour)} on ${day}`);
      const hourKeys = clock.map((entry) => entry.hourStart);

      const firstAt = nextCapturedAt();
      // Invented per-run shift of 0.000 to 0.049 kWh from the millisecond clock, so rows left by an earlier run are very
      // unlikely to equal this run's (the 9-versus-10 samples control below discriminates either way).
      const shift = (firstAt.getTime() % 50) / 1000;
      const baseLoads = [0.4, 0.5, 0.6, 0.7, 0.8];
      const loadOf = (hour: number): number => round3((hour === heaviestHour ? 0.95 : baseLoads[hour % 5]) + shift);
      const dayBody = (capturedAt: Date, samplesAtHeaviest: number) => ({
        ...baseBody(capturedAt),
        hourly_history: clock.map(({ hourStart, hour }) =>
          hourRow(hourStart, {
            load_kwh: loadOf(hour),
            grid_net_kwh: 0.3,
            pv_kwh: 0.1,
            samples: hour === heaviestHour ? samplesAtHeaviest : 12,
          }),
        ),
      });
      // The loader returns the whole window, rows of other runs included: keep only this test's own hours.
      const ownRows = async (now: Date) =>
        (await loadHourlyEnergy(owner, now)).filter((row) => hourKeys.includes(iso(row.hour_start)));

      // (a) 9 samples: the hour is a gap, so the day is not complete and there is nothing to rank.
      expect(await push(dayBody(firstAt, 9))).toEqual(CREATED);
      const nowA = new Date();
      const rowsA = await ownRows(nowA);
      expect(rowsA).toHaveLength(clock.length);
      expect(rowsA.find((row) => iso(row.hour_start) === heaviest.hourStart)).toMatchObject({
        load_kwh: loadOf(heaviestHour),
        samples: 9,
      });
      const viewA = toHourlyUsageView(rowsA, nowA);
      expect(viewA.kind).toBe("usage");
      if (viewA.kind !== "usage") throw new Error("expected a usage view");
      expect(viewA.hours).toEqual({
        kind: "insufficient",
        reason: "za mało danych: brak pełnego dnia",
        completeDays: 0,
      });

      // (b) Control: the same day pushed again, newer, with 10 samples at that hour. Every hour is complete now, the
      // day is complete, and the ranking's heaviest hour is the clock hour 13 at its 0.95 kWh (+ shift): the other
      // hours are 0.80 (+ shift) at most. The card labels an hour "HH:00–(HH+1):00", so 13 reads "13:00–14:00".
      expect(await push(dayBody(nextCapturedAt(), 10))).toEqual(CREATED);
      const nowB = new Date();
      const rowsB = await ownRows(nowB);
      expect(rowsB.find((row) => iso(row.hour_start) === heaviest.hourStart)?.samples).toBe(10);
      const viewB = toHourlyUsageView(rowsB, nowB);
      expect(viewB.kind).toBe("usage");
      if (viewB.kind !== "usage") throw new Error("expected a usage view");
      expect(viewB.window.completeDays).toBe(1);
      if (viewB.hours.kind !== "ranked") throw new Error(`expected a ranked hours view, got ${viewB.hours.kind}`);
      const [top] = viewB.hours.highest;
      expect(top).toMatchObject({ hourStart: heaviest.hourStart, dayKey: day, hourLabel: "13:00–14:00" });
      expect(top.loadKwh).toBeCloseTo(loadOf(heaviestHour), 6);
    });

    it("the 35-day prune removes an hour 40 days old and keeps one 30 days old", async () => {
      const now = Date.now();
      const hourAgo = (days: number): string =>
        new Date(Math.floor((now - days * 24 * HOUR_MS) / HOUR_MS) * HOUR_MS).toISOString();
      const old = hourAgo(40);
      const recent = hourAgo(30);

      const capturedAt = nextCapturedAt();
      // Values taken from the millisecond clock: a stored row of an earlier run is very unlikely to equal them. Loads stay
      // under 1 kWh (0.400 to 0.799), as the 30-day hour sits inside the dashboard's window.
      const ms = capturedAt.getTime();
      const load = round3(0.4 + (ms % 400) / 1000);
      const pv = (ms % 1000) / 1000;
      expect(
        await push({
          ...baseBody(capturedAt),
          hourly_history: [
            hourRow(old, { load_kwh: load, grid_net_kwh: 0.25, pv_kwh: pv, samples: 11 }),
            hourRow(recent, { load_kwh: load, grid_net_kwh: 0.25, pv_kwh: pv, samples: 11 }),
          ],
        }),
      ).toEqual(CREATED);

      // The 30-day hour is stored with this push's values; the 40-day hour was pruned by the same push.
      expect(await storedHours([old, recent])).toEqual([
        { hour_start: recent, load_kwh: load, grid_net_kwh: 0.25, pv_kwh: pv, samples: 11 },
      ]);
    });
  });

  describe("known gaps (pinned, not fixed)", () => {
    // KNOWN GAP: ingest_push replaces a stored daily value with any newer capture, even a lower one (lab corrections
    // downward can be legitimate). A guard such as greatest() on the total, or a rule that a total may only fall with
    // an explicit correction flag, would flip this test: the stored 10.6 would survive and the expectation changes.
    it("KNOWN GAP: a newer push with a lower daily total replaces the higher stored one", async () => {
      const [day] = await freshDays(owner, 1);
      expect(await push({ ...baseBody(nextCapturedAt()), daily_history: [dailyRow(day, { load_kwh: 10.6 })] })).toEqual(
        CREATED,
      );
      expect((await dayRows(day))[0].load_kwh).toBe(10.6);

      expect(await push({ ...baseBody(nextCapturedAt()), daily_history: [dailyRow(day, { load_kwh: 4.2 })] })).toEqual(
        CREATED,
      );
      expect((await dayRows(day))[0].load_kwh).toBe(4.2);
    });

    // KNOWN GAP: a newer push with a null total replaces a stored total with null, and the day turns into a gap on the
    // charts. A guard such as coalesce(excluded.load_kwh, stored.load_kwh) in ingest_push would keep the 10.6 and flip
    // this test.
    it("KNOWN GAP: a newer push with a null daily total replaces the stored one and the day becomes a gap", async () => {
      const [day] = await freshDays(owner, 1);
      expect(await push({ ...baseBody(nextCapturedAt()), daily_history: [dailyRow(day, { load_kwh: 10.6 })] })).toEqual(
        CREATED,
      );
      const before = await dayRows(day);
      expect(dailySeries(before, "load_kwh", day, 1)).toEqual([10.6]);

      expect(await push({ ...baseBody(nextCapturedAt()), daily_history: [dailyRow(day, { load_kwh: null })] })).toEqual(
        CREATED,
      );
      const after = await dayRows(day);
      expect(after[0].load_kwh).toBeNull();
      expect(dailySeries(after, "load_kwh", day, 1)).toEqual([null]);
    });

    // KNOWN GAP: a newer hourly push with fewer samples replaces the fuller hour (the row then reads as a gap).
    // A guard such as "keep the row with more samples" (greatest(samples) or a samples comparison in the upsert's where
    // clause) would keep the 12-sample row and flip this test.
    it("KNOWN GAP: a newer hourly push with fewer samples replaces the fuller hour", async () => {
      const [hour] = await freshWindowHours(owner, 1);
      expect(
        await push({
          ...baseBody(nextCapturedAt()),
          hourly_history: [hourRow(hour, { load_kwh: 0.6, samples: 12 })],
        }),
      ).toEqual(CREATED);
      expect(await storedHours([hour])).toEqual([
        { hour_start: hour, load_kwh: 0.6, grid_net_kwh: 0.2, pv_kwh: 0.3, samples: 12 },
      ]);

      expect(
        await push({
          ...baseBody(nextCapturedAt()),
          hourly_history: [hourRow(hour, { load_kwh: 0.7, samples: 4 })],
        }),
      ).toEqual(CREATED);
      expect(await storedHours([hour])).toEqual([
        { hour_start: hour, load_kwh: 0.7, grid_net_kwh: 0.2, pv_kwh: 0.3, samples: 4 },
      ]);
    });

    // KNOWN GAP: the contract accepts any ISO built_at, and the store keeps a summary row only against an entry whose
    // built_at is the same or newer, so one entry with a far-future built_at locks its (kind, period) row for good.
    // Fixed behaviour: a contract bound (built_at at most a few minutes ahead of the push) makes the far-future push
    // itself answer 422, so this test fails first at that push (the `farFuture` CREATED expectation). An upsert that
    // compares against now() instead would let the later current entry replace the far-future one, and the final
    // narration expectation would change.
    it("KNOWN GAP: a summary with a far-future built_at locks its row against a later, current entry", async () => {
      const day = await emptySummaryDay(owner);
      const text = (label: string) => `Invented ${label} text for ${day}.`;
      const entry = (builtAt: string, label: string) =>
        summary("day", day, {
          built_at: builtAt,
          narration: { text: text(label), generated_at: builtAt, provider: "openrouter", model: "invented-model" },
        });
      const pushEntry = (builtAt: string, label: string) =>
        push({ ...baseBody(nextCapturedAt()), period_summaries: [entry(builtAt, label)] });

      // Control: while built_at is honest, a newer entry replaces the row.
      expect(await pushEntry(new Date(Date.now() - 60_000).toISOString(), "first")).toEqual(CREATED);
      expect((await loadPeriodSummary(owner, "day", day))?.narration_text).toBe(text("first"));
      expect(await pushEntry(new Date().toISOString(), "second")).toEqual(CREATED);
      expect((await loadPeriodSummary(owner, "day", day))?.narration_text).toBe(text("second"));

      // The far-future entry is itself newer, so it is stored.
      const farFuture = "2099-01-01T00:00:00.000Z";
      expect(await pushEntry(farFuture, "far-future")).toEqual(CREATED);
      expect((await loadPeriodSummary(owner, "day", day))?.narration_text).toBe(text("far-future"));

      // The gap: a later entry with a current built_at is accepted (201) but the far-future entry stays.
      expect(await pushEntry(new Date().toISOString(), "current")).toEqual(CREATED);
      const row = await loadPeriodSummary(owner, "day", day);
      expect(row?.narration_text).toBe(text("far-future"));
      expect(instant(row?.built_at)).toBe(Date.parse(farFuture));
    });

    // KNOWN GAP: a second recommendation with the same generated_at but different text is dropped silently
    // (on conflict do nothing) while the push answers 201. Fixed behaviour: a 409 for a repeated generated_at makes the
    // second push fail the second CREATED expectation first; an upsert that replaces the text would instead change the
    // final text expectation.
    it("KNOWN GAP: a second recommendation with the same generated_at keeps the first text and still answers 201", async () => {
      const generatedAt = nextCapturedAt();
      const firstText = `Invented first advice ${String(generatedAt.getTime())}: charge at night.`;
      const secondText = `Invented second advice ${String(generatedAt.getTime())}: charge at noon.`;

      expect(
        await push({ ...baseBody(nextCapturedAt()), recommendation: recommendation(generatedAt, { text: firstText }) }),
      ).toEqual(CREATED);

      const secondAt = nextCapturedAt();
      expect(
        await push({
          ...baseBody(secondAt, { pv_w: 1930 }),
          recommendation: recommendation(generatedAt, { text: secondText }),
        }),
      ).toEqual(CREATED);

      // Control: the second push itself was stored (it is the newest live state).
      expect(instant((await loadLiveState(owner))?.captured_at)).toBe(secondAt.getTime());

      const { data, error } = await owner
        .from("recommendations")
        .select("generated_at, text")
        .eq("generated_at", generatedAt.toISOString())
        .overrideTypes<{ generated_at: string; text: string }[], { merge: false }>();
      expect(error).toBeNull();
      expect((data ?? []).map((row) => row.text)).toEqual([firstText]);
    });
  });
});
