import { beforeAll, describe, expect, it } from "vitest";
import { toBillForecastView, loadBillForecast } from "@/lib/services/bill-forecast";
import { loadDailyRange } from "@/lib/services/calendar-data";
import { dailySeries } from "@/lib/services/daily-series";
import { loadHourlyEnergy, toHourlyUsageView } from "@/lib/services/hourly-usage";
import { loadLiveState, toLiveStateView } from "@/lib/services/live-state";
import { loadPeriodSummary, toSummaryView } from "@/lib/services/period-summary";
import { loadLatestRecommendation, toRecommendationView } from "@/lib/services/recommendation";
import { baseBody, billForecast, dailyRow, hourRow, recommendation, summary } from "./support/bodies";
import { emptySummaryDay, emptyWeek, freshDays, freshWindowHours, nextCapturedAt, windowHours } from "./support/keys";
import { push } from "./support/push";
import { ownerClient, requireStack } from "./support/stack";

// Risk #3: each section a lab push can carry goes through the real handleIngest and the real ingest_push store, is
// read back by the owner's real loader and mapped by the real view mapper, and shows up on its own surface only.
// Every figure pushed is invented and every expectation is a literal written here, never a value read off the code.

type Owner = Awaited<ReturnType<typeof ownerClient>>;

const CREATED = { status: 201, body: { status: "created" } };

// Postgres hands timestamptz back as "...+00:00"; compare instants, not spellings.
const instant = (value: string | null | undefined): number => Date.parse(value ?? "");

describe("push to page: one test per section", () => {
  let owner: Owner;

  beforeAll(async () => {
    requireStack();
    owner = await ownerClient();
  });

  const sections: { section: string; run: () => Promise<void> }[] = [
    {
      section: "state",
      run: async () => {
        const capturedAt = nextCapturedAt();
        expect(await push(baseBody(capturedAt, { pv_w: 3100 }))).toEqual(CREATED);

        const row = await loadLiveState(owner);
        expect(instant(row?.captured_at)).toBe(capturedAt.getTime());

        const view = toLiveStateView(row, new Date(), [], null);
        if (view.kind !== "state") throw new Error(`expected a state view, got ${view.kind}`);
        expect(view.status.label).toBe("aktualne");
        expect(view.isStale).toBe(false);
        // 3100 W: decimal comma, one decimal, kW.
        expect(view.pv).toBe("3,1 kW");
      },
    },
    {
      section: "daily_history",
      run: async () => {
        const week = await emptyWeek(owner);
        const [d0, , d2, d3, , , d6] = week;
        const pushed = [
          { day: d0, pv_kwh: 6.4, load_kwh: 11.2, grid_import_kwh: 3.9, grid_export_kwh: 1.1 },
          { day: d2, pv_kwh: 8.8, load_kwh: 9.6, grid_import_kwh: 2.4, grid_export_kwh: 2.3 },
          { day: d3, pv_kwh: 1.5, load_kwh: 13.7, grid_import_kwh: 8.2, grid_export_kwh: 0.2 },
        ];
        const result = await push({
          ...baseBody(nextCapturedAt()),
          daily_history: pushed.map((row) => dailyRow(row.day, row)),
        });
        expect(result).toEqual(CREATED);

        // Exactly the pushed days with the pushed values; the days in between stay absent.
        const rows = await loadDailyRange(owner, d0, d6);
        expect(rows).toEqual(pushed.map((row) => ({ ...row, pv_forecast_kwh: null })));

        // Calendar slots over d0 ... d6: 11.2, gap, 9.6, 13.7, gap, gap, gap. A gap is null, never 0.
        expect(dailySeries(rows, "load_kwh", d6, 7)).toEqual([11.2, null, 9.6, 13.7, null, null, null]);
      },
    },
    {
      section: "hourly_history",
      run: async () => {
        // 5 whole hours that have ended: not a complete Warsaw day, so the ranking has nothing to rank yet.
        const hours = windowHours(5);
        // The same hours can hold rows from a run in the same clock hour, so the house-use figures shift by an invented
        // 0.00 to 0.49 kWh each run: a stored row of an earlier run can never equal what this push wrote.
        const capturedAt = nextCapturedAt();
        const shift = (capturedAt.getTime() % 50) / 100;
        const load = (base: number) => Math.round((base + shift) * 100) / 100;
        const pushed = [
          { load_kwh: load(0.6), grid_net_kwh: 0.2, pv_kwh: 0.1, samples: 12 },
          { load_kwh: load(0.7), grid_net_kwh: 0.3, pv_kwh: 0.2, samples: 11 },
          { load_kwh: load(0.8), grid_net_kwh: -0.1, pv_kwh: 0.9, samples: 10 },
          { load_kwh: load(0.9), grid_net_kwh: 0.4, pv_kwh: 0.0, samples: 12 },
          { load_kwh: load(1.1), grid_net_kwh: 0.6, pv_kwh: 0.3, samples: 12 },
        ];
        const result = await push({
          ...baseBody(capturedAt),
          hourly_history: hours.map((hour, i) => hourRow(hour, pushed[i])),
        });
        expect(result).toEqual(CREATED);

        // The loader returns the whole window, rows of other runs included: keep only this test's own hours.
        const now = new Date();
        const own = (await loadHourlyEnergy(owner, now)).filter((row) =>
          hours.includes(new Date(row.hour_start).toISOString()),
        );
        expect(
          own
            .map((row) => ({ ...row, hour_start: new Date(row.hour_start).toISOString() }))
            .sort((a, b) => a.hour_start.localeCompare(b.hour_start)),
        ).toEqual(hours.map((hour, i) => ({ hour_start: hour, ...pushed[i] })));

        // "usage" (not "empty") with this reason proves the loaded hours reached the view: no complete day among them.
        const view = toHourlyUsageView(own, now);
        expect(view.kind).toBe("usage");
        if (view.kind !== "usage") throw new Error("expected a usage view");
        expect(view.hours).toEqual({
          kind: "insufficient",
          reason: "za mało danych: brak pełnego dnia",
          completeDays: 0,
        });
      },
    },
    {
      section: "recommendation",
      run: async () => {
        const capturedAt = nextCapturedAt();
        const generatedAt = nextCapturedAt();
        const text = `Invented advice ${String(generatedAt.getTime())}: run the dishwasher after noon.`;
        expect(await push({ ...baseBody(capturedAt), recommendation: recommendation(generatedAt, { text }) })).toEqual(
          CREATED,
        );

        const row = await loadLatestRecommendation(owner);
        expect(row?.text).toBe(text);
        expect(instant(row?.generated_at)).toBe(generatedAt.getTime());

        const view = toRecommendationView(row, new Date());
        if (view.kind !== "recommendation") throw new Error(`expected a recommendation view, got ${view.kind}`);
        expect(view.text).toBe(text);
        expect(view.isStale).toBe(false);
        expect(view.isCurrent).toBe(true);
        expect(view.status.label).toBe("aktualna");
      },
    },
    {
      section: "bill_forecast",
      run: async () => {
        const forecast = billForecast();
        expect(await push({ ...baseBody(nextCapturedAt()), bill_forecast: forecast })).toEqual(CREATED);

        const row = await loadBillForecast(owner);
        expect(row?.bill_forecast).toMatchObject({ generated_at: forecast.generated_at, month: forecast.month });

        // The fixture's central 231.75 and range 141.2 to 322.3, rounded to whole złoty by hand. The day label and the
        // verdict text are left alone: the first depends on the year, the second on the fixture's own invoice.
        const view = toBillForecastView(row, new Date());
        expect(view.kind).toBe("forecast");
        if (view.kind !== "forecast") throw new Error(`expected a forecast view, got ${view.kind}`);
        expect(view.centralLabel).toBe("ok. 232 zł");
        expect(view.rangeLabel).toBe("od 141 zł do 322 zł");
      },
    },
    {
      section: "period_summaries",
      run: async () => {
        const day = await emptySummaryDay(owner);
        const builtAt = new Date().toISOString();
        const narrationAt = new Date().toISOString();
        const text = `Invented day text ${day}: the house used more than it made.`;
        const facts = { invented_figure: 4217, invented_flag: true, invented_label: "synthetic" };
        const entry = summary("day", day, {
          built_at: builtAt,
          facts,
          narration: { text, generated_at: narrationAt, provider: "openrouter", model: "invented-model-7" },
        });
        expect(await push({ ...baseBody(nextCapturedAt()), period_summaries: [entry] })).toEqual(CREATED);

        const row = await loadPeriodSummary(owner, "day", day);
        expect(row).not.toBeNull();
        expect(row).toMatchObject({
          kind: "day",
          period: day,
          narration_text: text,
          narration_provider: "openrouter",
          narration_model: "invented-model-7",
        });
        expect(instant(row?.built_at)).toBe(instant(builtAt));
        expect(instant(row?.narration_generated_at)).toBe(instant(narrationAt));

        // The loader does not select `facts`; read them straight from the table as the owner.
        const { data, error } = await owner
          .from("period_summaries")
          .select("facts")
          .eq("kind", "day")
          .eq("period", day)
          .overrideTypes<{ facts: unknown }[], { merge: false }>();
        if (error) throw new Error(`reading period summary facts failed: ${error.message}`);
        expect(data).toEqual([{ facts }]);

        const view = row ? toSummaryView(row, "day") : null;
        expect(view?.kind).toBe("narrated");
        if (view?.kind === "narrated") expect(view.text).toBe(text);
      },
    },
  ];

  it.each(sections)("$section reaches its own loader and view", async ({ run }) => {
    await run();
  });

  describe("right surface", () => {
    it("a daily-only push creates no hourly row and no recommendation", async () => {
      const [day] = await freshDays(owner, 1);
      const hours = await freshWindowHours(owner, 3);
      const generatedAt = nextCapturedAt();

      const result = await push({ ...baseBody(nextCapturedAt()), daily_history: [dailyRow(day, { load_kwh: 12.3 })] });
      expect(result).toEqual(CREATED);

      // Control: the push did land, on the daily surface.
      expect(await loadDailyRange(owner, day, day)).toEqual([
        { day, pv_kwh: 7.5, load_kwh: 12.3, grid_import_kwh: 3, grid_export_kwh: 1.5, pv_forecast_kwh: null },
      ]);

      const hourly = await owner.from("hourly_energy").select("hour_start").in("hour_start", hours);
      expect(hourly.error).toBeNull();
      expect(hourly.data).toEqual([]);

      const recommendations = await owner
        .from("recommendations")
        .select("generated_at")
        .eq("generated_at", generatedAt.toISOString());
      expect(recommendations.error).toBeNull();
      expect(recommendations.data).toEqual([]);
    });

    it("a state-only push leaves daily keys empty", async () => {
      const days = await freshDays(owner, 3);
      const capturedAt = nextCapturedAt();

      expect(await push(baseBody(capturedAt, { pv_w: 2740 }))).toEqual(CREATED);

      // Control: the push did land, as the newest live state.
      expect(instant((await loadLiveState(owner))?.captured_at)).toBe(capturedAt.getTime());

      const daily = await owner.from("daily_energy").select("day").in("day", days);
      expect(daily.error).toBeNull();
      expect(daily.data).toEqual([]);
    });

    it("a newer push without bill_forecast keeps the earlier forecast and still moves the live state", async () => {
      const forecast = billForecast();
      expect(await push({ ...baseBody(nextCapturedAt()), bill_forecast: forecast })).toEqual(CREATED);

      const laterAt = nextCapturedAt();
      expect(await push(baseBody(laterAt, { pv_w: 1860 }))).toEqual(CREATED);

      // The forecast view is the newest push that carries the section; the live state is the newest push of all.
      expect((await loadBillForecast(owner))?.bill_forecast).toMatchObject({ generated_at: forecast.generated_at });
      expect(instant((await loadLiveState(owner))?.captured_at)).toBe(laterAt.getTime());
    });
  });
});
