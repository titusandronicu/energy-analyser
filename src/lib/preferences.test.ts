import { describe, expect, it } from "vitest";
import { readPreference, writePreference } from "./preferences";
import type { StorageLike } from "./preferences";

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const blocked: StorageLike = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

const VIEWS = ["diagram", "readings"] as const;

describe("readPreference", () => {
  it("returns the default when nothing is stored", () => {
    expect(readPreference(fakeStorage(), "k", VIEWS, "diagram")).toBe("diagram");
  });

  it("returns an allowed stored value", () => {
    expect(readPreference(fakeStorage({ k: "readings" }), "k", VIEWS, "diagram")).toBe("readings");
  });

  it.each(["", "Readings", "table", "1", "null"])("falls back on the invalid stored value %j", (stored) => {
    expect(readPreference(fakeStorage({ k: stored }), "k", VIEWS, "diagram")).toBe("diagram");
  });

  it("falls back when the storage throws", () => {
    expect(readPreference(blocked, "k", VIEWS, "readings")).toBe("readings");
  });

  it.each([null, undefined])("falls back when there is no storage (%j)", (storage) => {
    expect(readPreference(storage, "k", VIEWS, "diagram")).toBe("diagram");
  });
});

describe("writePreference", () => {
  it("writes and reads back", () => {
    const storage = fakeStorage();
    expect(writePreference(storage, "k", "readings")).toBe(true);
    expect(readPreference(storage, "k", VIEWS, "diagram")).toBe("readings");
  });

  it("reports false instead of throwing when the storage is blocked", () => {
    expect(writePreference(blocked, "k", "readings")).toBe(false);
  });

  it.each([null, undefined])("reports false without storage (%j)", (storage) => {
    expect(writePreference(storage, "k", "readings")).toBe(false);
  });
});
