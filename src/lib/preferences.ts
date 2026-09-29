// Pure read/validate/write of small UI preferences. The storage is a parameter so the logic runs in node tests and
// the callers decide what "storage" is. Every access is guarded: blocked or missing storage (private mode, disabled
// cookies, quota) must leave the defaults working, never throw. Only ever store presentation choices here, never
// readings.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const FLOW_VIEW_KEY = "ea:flow-view";
export const FLOW_PAUSED_KEY = "ea:flow-paused";

// The stored value when it is one of `allowed`, otherwise `fallback`. The result is always one of the allowed
// strings, so it is a stable primitive for useSyncExternalStore snapshots.
export function readPreference<T extends string>(
  storage: StorageLike | null | undefined,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  try {
    const stored = storage?.getItem(key);
    return allowed.find((value) => value === stored) ?? fallback;
  } catch {
    return fallback;
  }
}

// Returns whether the value was stored; false when the storage is blocked or full.
export function writePreference(storage: StorageLike | null | undefined, key: string, value: string): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
