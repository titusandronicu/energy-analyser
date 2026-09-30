import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { HourlyEnergyRow } from "@/types";
import { addDays, warsawDayHours } from "@/lib/format/warsaw-time";
import {
  INCOMPLETE_NIGHTS,
  isSuspectLowHour,
  loadHourlyEnergy,
  MIN_HOUR_SAMPLES,
  MIN_RANKED_DAYS,
  nightName,
  NO_HOURLY_DATA,
  toHourlyUsageView,
} from "./hourly-usage";

// All data here is synthetic. The repository is public, so no test uses the owner's real consumption.

// 12:00 in Warsaw (CEST) on 10 August 2026: the most recent night that has ended is the night from 9 to 10 August.
const now = new Date("2026-08-10T10:00:00Z");

interface HourShape {
  load?: number;
  net?: number | null;
  samples?: number;
}

function row(startMs: number, shape: HourShape = {}): HourlyEnergyRow {
  return {
    hour_start: new Date(startMs).toISOString(),
    load_kwh: shape.load ?? 1,
    grid_net_kwh: shape.net === undefined ? 0.5 : shape.net,
    pv_kwh: 0,
    samples: shape.samples ?? 12,
  };
}

// Every clock hour of a Warsaw day, shaped per clock hour (the index disambiguates the repeated autumn 02:00).
function day(dayKey: string, shape: (hour: number, index: number) => HourShape = () => ({})): HourlyEnergyRow[] {
  return warsawDayHours(dayKey).map((h, i) => row(h.startMs, shape(h.hour, i)));
}

// `count` consecutive complete days ending on `last`, all with the same hourly shape.
function days(last: string, count: number, shape?: (hour: number, index: number) => HourShape): HourlyEnergyRow[] {
  return Array.from({ length: count }, (_, i) => day(addDays(last, -i), shape)).flat();
}

function usage(rows: HourlyEnergyRow[], clock: Date = now) {
  const v = toHourlyUsageView(rows, clock);
  if (v.kind !== "usage") throw new Error(`expected a usage view, got ${v.reason}`);
  return v;
}

function without(rows: HourlyEnergyRow[], iso: string) {
  return rows.filter((r) => r.hour_start !== iso);
}

function withSamples(rows: HourlyEnergyRow[], iso: string, samples: number) {
  return rows.map((r) => (r.hour_start === iso ? { ...r, samples } : r));
}

describe("toHourlyUsageView", () => {
  it("refuses an empty window", () => {
    expect(toHourlyUsageView([], now)).toEqual({
      kind: "empty",
      status: { tone: "insufficient", label: "" },
      reason: NO_HOURLY_DATA,
    });
  });

  it("refuses when only rows outside the window or not yet ended exist", () => {
    const old = day("2026-07-01");
    const current = [row(Date.parse("2026-08-10T10:00:00Z"))];
    expect(toHourlyUsageView([...old, ...current], now).kind).toBe("empty");
  });

  it("refuses when no hour is complete", () => {
    const v = toHourlyUsageView(
      day("2026-08-09", () => ({ samples: 9 })),
      now,
    );
    expect(v.kind).toBe("empty");
    if (v.kind === "empty") expect(v.reason).toContain(NO_HOURLY_DATA);
  });

  describe("hour completeness", () => {
    it(`counts an hour with ${String(MIN_HOUR_SAMPLES)} samples and drops one with 9`, () => {
      const complete = usage(day("2026-08-09", (h) => ({ samples: 10, load: h === 20 ? 5 : 1 })));
      expect(complete.window.completeDays).toBe(1);
      if (complete.hours.kind !== "ranked") throw new Error("expected ranked hours");
      expect(complete.hours.highest[0]).toMatchObject({ hourLabel: "20:00–21:00", loadKwh: 5 });

      const gap = usage([
        ...day("2026-08-08"),
        ...day("2026-08-09", (h) => ({ samples: h === 20 ? 9 : 12, load: h === 20 ? 5 : 1 })),
      ]);
      // The 9-sample hour is neither ranked nor enough for its day to be complete.
      expect(gap.window.completeDays).toBe(1);
      if (gap.hours.kind !== "ranked") throw new Error("expected ranked hours");
      expect(gap.hours.highest.map((h) => h.loadKwh)).not.toContain(5);
    });

    it("drops an hour without house use or net grid", () => {
      const rows = day("2026-08-09", (h) => (h === 12 ? { net: null } : {}));
      expect(usage(rows).window.completeDays).toBe(0);
    });
  });

  describe("daylight-saving days", () => {
    it("treats the 23-hour spring day as complete with 23 hours", () => {
      const clock = new Date("2026-03-30T10:00:00Z");
      const rows = day("2026-03-29");
      expect(rows).toHaveLength(23);
      const v = usage(rows, clock);
      expect(v.window.completeDays).toBe(1);
      expect(v.hours.kind).toBe("ranked");
    });

    it("needs all 25 hours of the autumn day, including both 02:00 hours", () => {
      const clock = new Date("2026-10-26T10:00:00Z");
      const rows = day("2026-10-25", (_h, i) => ({ load: i === 3 ? 4 : 1 }));
      expect(rows).toHaveLength(25);
      expect(usage(rows, clock).window.completeDays).toBe(1);
      // Only 24 of its 25 hours: the second 02:00 (01:00 UTC) is missing.
      expect(usage(without(rows, "2026-10-25T01:00:00.000Z"), clock).window.completeDays).toBe(0);
    });

    it("sums the 25 hours into the autumn day's total", () => {
      const clock = new Date("2026-11-02T10:00:00Z");
      const rows = days("2026-11-01", 8);
      const v = usage(rows, clock);
      if (v.days.kind !== "ranked") throw new Error("expected ranked days");
      // Every day is 1 kWh an hour except that 2026-10-25 has 25 hours.
      expect(v.days.highest[0]).toMatchObject({ dayKey: "2026-10-25", loadKwh: 25, weekday: "niedziela" });
    });
  });

  describe("nights", () => {
    it("names a night by both dates", () => {
      expect(nightName("2026-08-01")).toBe("noc z 1 na 2 sierpnia");
      expect(nightName("2026-07-31")).toBe("noc z 31 lipca na 1 sierpnia");
      expect(nightName("2026-12-31")).toBe("noc z 31 grudnia na 1 stycznia");
    });

    it("sums a night across midnight, 22:00 to 06:00", () => {
      // 1 kWh per night hour, 5 kWh per day hour: only the 8 night hours count.
      const rows = days("2026-08-10", 2, (h) => ({ net: h >= 22 || h < 6 ? 1 : 5 })).filter(
        (r) => Date.parse(r.hour_start) + 3_600_000 <= now.getTime(),
      );
      const v = usage(rows);
      expect(v.lastNight).toEqual({
        complete: true,
        label: "noc z 9 na 10 sierpnia",
        gridDrawKwh: 8,
        gridDrawLabel: "8,0 kWh",
      });
    });

    it("counts the 7-hour spring night and the 9-hour autumn night", () => {
      const nightNet = (h: number) => ({ net: h >= 22 || h < 6 ? 1 : 0 });
      const spring = usage(days("2026-03-29", 2, nightNet), new Date("2026-03-29T10:00:00Z"));
      expect(spring.lastNight).toMatchObject({ complete: true, label: "noc z 28 na 29 marca", gridDrawKwh: 7 });

      const autumn = usage(days("2026-10-25", 2, nightNet), new Date("2026-10-25T10:00:00Z"));
      expect(autumn.lastNight).toMatchObject({ complete: true, label: "noc z 24 na 25 października", gridDrawKwh: 9 });
    });

    it("ignores an exporting hour: the draw is the sum of max(net, 0)", () => {
      // 0,5 kWh per night hour, except 23:00 exports 2 kWh; the export is not subtracted.
      const rows = days("2026-08-10", 2, (h) => ({ net: h === 23 ? -2 : 0.5 }));
      const v = usage(rows);
      expect(v.lastNight).toMatchObject({ complete: true, gridDrawKwh: 3.5 });
    });

    it("waits for 06:00 before the night counts as ended", () => {
      const rows = days("2026-08-10", 3);
      // 05:30 on 10 August: the night from 9 to 10 August is still running.
      const early = usage(rows, new Date("2026-08-10T03:30:00Z"));
      expect(early.lastNight).toMatchObject({ complete: true, label: "noc z 8 na 9 sierpnia" });
    });

    it("falls back to an earlier complete night among the last three", () => {
      // 01:00 on 10 August (23:00 UTC on the 9th) is a gap, so the night from 9 to 10 August is incomplete.
      const rows = withSamples(days("2026-08-10", 4), "2026-08-09T23:00:00.000Z", 6);
      expect(usage(rows).lastNight).toMatchObject({ complete: true, label: "noc z 8 na 9 sierpnia" });

      // The night from 8 to 9 August is missing an hour as well: the one from 7 to 8 August stands in.
      const two = without(rows, "2026-08-08T21:00:00.000Z");
      expect(usage(two).lastNight).toMatchObject({ complete: true, label: "noc z 7 na 8 sierpnia" });
    });

    it("says the recent nights are incomplete when none of the last three is complete", () => {
      let rows = days("2026-08-10", 10);
      // A gap in each of the nights 7→8, 8→9 and 9→10 August; the night 6→7 stays complete.
      for (const iso of ["2026-08-07T23:00:00.000Z", "2026-08-08T23:00:00.000Z", "2026-08-09T23:00:00.000Z"]) {
        rows = withSamples(rows, iso, 3);
      }
      const v = usage(rows);
      expect(v.lastNight).toEqual({ complete: false, reason: INCOMPLETE_NIGHTS });
      // The older complete nights still make the average.
      expect(v.nightAverage).toMatchObject({ gridDrawKwh: 4, gridDrawLabel: "4,0 kWh" });
    });

    it("averages the complete nights and counts them", () => {
      // Nights of 8 × 0,5 = 4 kWh, and one night of 8 × 1 = 8 kWh.
      const rows = days("2026-08-10", 4, () => ({ net: 0.5 })).map((r) =>
        Date.parse(r.hour_start) >= Date.parse("2026-08-08T20:00:00Z") &&
        Date.parse(r.hour_start) < Date.parse("2026-08-09T04:00:00Z")
          ? { ...r, grid_net_kwh: 1 }
          : r,
      );
      const v = usage(rows);
      // Nights 7→8, 8→9 and 9→10 August are complete; the night 6→7 has no evening hours.
      expect(v.nightAverage).toEqual({ gridDrawKwh: 16 / 3, gridDrawLabel: "5,3 kWh", nights: 3 });
    });
  });

  describe("rankings", () => {
    it("breaks ties in favour of the more recent hour and day", () => {
      const rows = days("2026-08-09", MIN_RANKED_DAYS);
      const v = usage(rows);
      if (v.hours.kind !== "ranked" || v.days.kind !== "ranked") throw new Error("expected rankings");
      // Every hour and day is equal, so both lists run newest first.
      const newest = rows
        .map((r) => r.hour_start)
        .sort()
        .reverse()
        .slice(0, 5);
      expect(v.hours.highest.map((h) => h.hourStart)).toEqual(newest);
      expect(v.hours.lowest.map((h) => h.hourStart)).toEqual(newest);
      expect(v.days.highest.map((d) => d.dayKey)).toEqual(["2026-08-09", "2026-08-08", "2026-08-07"]);
      expect(v.days.lowest.map((d) => d.dayKey)).toEqual(["2026-08-09", "2026-08-08", "2026-08-07"]);
    });

    it(`needs ${String(MIN_RANKED_DAYS)} complete days for the day lists`, () => {
      const six = usage(days("2026-08-09", MIN_RANKED_DAYS - 1));
      expect(six.days).toEqual({ kind: "insufficient", reason: "za mało dni: 6 z 7", completeDays: 6 });
      // Hours are ranked from one complete day.
      expect(six.hours.kind).toBe("ranked");

      const seven = usage(days("2026-08-09", MIN_RANKED_DAYS));
      expect(seven.days.kind).toBe("ranked");
    });

    it("needs one complete day for the hour lists", () => {
      const partial = without(day("2026-08-09"), "2026-08-09T10:00:00.000Z");
      expect(usage(partial).hours).toEqual({
        kind: "insufficient",
        reason: "za mało danych: brak pełnego dnia",
        completeDays: 0,
      });
    });

    it("leaves an hour that drew far more from the grid than the house used out of the lowest list only", () => {
      // 03:00: 0.2 kWh of house use against 1.9 kWh from the grid, the shape seen in production on 2026-09-30.
      const v = usage(day("2026-08-09", (h) => (h === 3 ? { load: 0.2, net: 1.9 } : h === 4 ? { load: 0.3 } : {})));
      if (v.hours.kind !== "ranked") throw new Error("expected ranked hours");
      const lowest = v.hours.lowest.map((h) => h.hourLabel);
      expect(lowest).not.toContain("03:00–04:00");
      expect(lowest[0]).toBe("04:00–05:00");
      // A margin of exactly 0.5 kWh is not suspect.
      expect(isSuspectLowHour({ loadKwh: 1, gridDrawKwh: 1.5 })).toBe(false);
      expect(isSuspectLowHour({ loadKwh: 1, gridDrawKwh: 1.51 })).toBe(true);
    });

    it("shows the hour's grid draw beside its house use", () => {
      const v = usage(day("2026-08-09", (h) => (h === 13 ? { load: 3, net: -1.5 } : {})));
      if (v.hours.kind !== "ranked") throw new Error("expected ranked hours");
      expect(v.hours.highest[0]).toEqual({
        hourStart: "2026-08-09T11:00:00.000Z",
        dayKey: "2026-08-09",
        dayLabel: "9 sierpnia",
        weekday: "niedziela",
        hourLabel: "13:00–14:00",
        loadKwh: 3,
        loadLabel: "3,0 kWh",
        gridDrawKwh: 0,
        gridDrawLabel: "0,0 kWh",
      });
    });
  });

  it("describes the window and the completeness rule", () => {
    const v = usage([...day("2026-08-01"), ...day("2026-08-09")]);
    expect(v.window).toEqual({
      label: "2 dni: 1–9 sierpnia",
      completeDays: 2,
      completenessRule:
        "Liczą się tylko pełne godziny (co najmniej 10 z 12 odczytów co 5 minut) i pełne dni (wszystkie godziny dnia pełne).",
    });
  });

  describe("synthetic August-shaped month", () => {
    // Shaped like the frame's worked example, with invented numbers: two days (1 and 2 August) at about 8 kW for
    // most of the day and into the night, quiet nights otherwise, midday export, and a few gap hours.
    const heavy = new Set(["2026-08-01", "2026-08-02"]);
    function shape(dayKey: string) {
      return (hour: number): HourShape => {
        if (heavy.has(dayKey)) {
          const busy = hour >= 8 || hour < 2;
          const load = busy ? (hour === 20 && dayKey === "2026-08-02" ? 8.6 : 8) : 0.6;
          return { load, net: hour >= 11 && hour < 15 ? load - 4 : load };
        }
        const night = hour >= 22 || hour < 6;
        const evening = hour >= 18 && hour < 22;
        const load = night ? 0.4 : evening ? 2.2 : 1.1;
        // Midday PV covers the house and exports.
        return { load, net: hour >= 10 && hour < 16 ? -1.5 : load };
      };
    }
    const gaps = ["2026-08-05T01:00:00.000Z", "2026-08-05T02:00:00.000Z", "2026-08-12T15:00:00.000Z"];
    const clock = new Date("2026-08-20T10:00:00Z");
    const rows = Array.from({ length: 19 }, (_, i) => addDays("2026-08-01", i))
      .flatMap((d) => day(d, shape(d)))
      .map((r) => (gaps.includes(r.hour_start) ? { ...r, samples: 7 } : r));

    it("ranks the two ~8 kW days highest and one of their evening hours first", () => {
      const v = usage(rows, clock);
      if (v.hours.kind !== "ranked" || v.days.kind !== "ranked") throw new Error("expected rankings");
      expect(v.days.highest.map((d) => d.dayKey).slice(0, 2)).toEqual(["2026-08-02", "2026-08-01"]);
      expect(v.hours.highest[0]).toMatchObject({ dayKey: "2026-08-02", hourLabel: "20:00–21:00", loadKwh: 8.6 });
      expect(v.hours.highest.every((h) => heavy.has(h.dayKey))).toBe(true);
      // The quietest hours are night hours of ordinary days.
      expect(v.hours.lowest.every((h) => h.loadKwh === 0.4)).toBe(true);
    });

    it("leaves the days with gap hours out of the day lists", () => {
      const v = usage(rows, clock);
      // 19 days, two with gaps (5 and 12 August).
      expect(v.window.completeDays).toBe(17);
      expect(v.window.label).toBe("19 dni: 1–19 sierpnia");
      if (v.days.kind !== "ranked") throw new Error("expected ranked days");
      const listed = [...v.days.highest, ...v.days.lowest].map((d) => d.dayKey);
      expect(listed).not.toContain("2026-08-05");
      expect(listed).not.toContain("2026-08-12");
    });

    it("reads a quiet last night and averages the complete nights", () => {
      const v = usage(rows, clock);
      // The data ends on 19 August, so the night from 19 to 20 August is incomplete and the one before stands in:
      // 8 × 0,4 kWh.
      expect(v.lastNight).toMatchObject({ complete: true, label: "noc z 18 na 19 sierpnia" });
      if (!v.lastNight.complete) throw new Error("expected a complete night");
      expect(v.lastNight.gridDrawKwh).toBeCloseTo(3.2);
      // Nights 1→2 to 18→19 August, less 4→5 August (gaps); 31 July → 1 August lacks its evening.
      expect(v.nightAverage?.nights).toBe(17);
      // The heavy nights (1→2 and 2→3 August) lift the average above an ordinary night's 3,2 kWh.
      expect(v.nightAverage?.gridDrawKwh).toBeGreaterThan(3.2);
    });
  });
});

describe("loadHourlyEnergy", () => {
  // Records the arguments of the query chain and resolves with the given result.
  function mockClient(result: { data: HourlyEnergyRow[] | null; error: { message: string } | null }) {
    const calls: Record<string, unknown[]> = {};
    const chain = {
      from: (...args: unknown[]) => ((calls.from = args), chain),
      select: (...args: unknown[]) => ((calls.select = args), chain),
      gte: (...args: unknown[]) => ((calls.gte = args), chain),
      lt: (...args: unknown[]) => ((calls.lt = args), chain),
      order: (...args: unknown[]) => ((calls.order = args), chain),
      overrideTypes: () => Promise.resolve(result),
    };
    return { client: chain as unknown as SupabaseClient, calls };
  }

  it("reads the last 35 Warsaw days, newest first", async () => {
    const rows = day("2026-08-09");
    const { client, calls } = mockClient({ data: rows, error: null });
    await expect(loadHourlyEnergy(client, now)).resolves.toEqual(rows);
    expect(calls.from).toEqual(["hourly_energy"]);
    expect(calls.select).toEqual(["hour_start, load_kwh, grid_net_kwh, pv_kwh, samples"]);
    // Warsaw midnight of 6 July 2026 (35 days before 10 August), in UTC.
    expect(calls.gte).toEqual(["hour_start", "2026-07-05T22:00:00.000Z"]);
    // Nothing from the future: a bad future row can't crowd real hours out of the row cap.
    expect(calls.lt).toEqual(["hour_start", "2026-08-10T10:00:00.000Z"]);
    expect(calls.order).toEqual(["hour_start", { ascending: false }]);
  });

  it("throws on a load error", async () => {
    const { client } = mockClient({ data: null, error: { message: "permission denied" } });
    await expect(loadHourlyEnergy(client, now)).rejects.toThrow("loading hourly energy failed: permission denied");
  });
});
