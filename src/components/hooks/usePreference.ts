import { useCallback, useSyncExternalStore } from "react";
import { readPreference, writePreference } from "@/lib/preferences";
import type { StorageLike } from "@/lib/preferences";

// The `storage` event does not fire in the tab that writes, so same-tab writes notify through this set.
const listeners = new Set<() => void>();

// Values that could not be persisted (blocked or full storage) stay here so the control still works until reload.
const unsaved = new Map<string, string>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Even reading the `localStorage` property can throw when storage is blocked, so every access is guarded.
const storage: StorageLike = {
  getItem(key) {
    const pending = unsaved.get(key);
    if (pending !== undefined) return pending;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
      unsaved.delete(key);
    } catch {
      unsaved.set(key, value);
    }
  },
};

// A persisted string preference restricted to `allowed`. The server snapshot is the default, so the server render
// and the first client render match; the stored value then arrives without an effect. The snapshot is a plain
// string, so it is stable between reads.
export function usePreference<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): readonly [T, (value: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readPreference(storage, key, allowed, fallback),
    () => fallback,
  );
  const setValue = useCallback(
    (next: T) => {
      writePreference(storage, key, next);
      listeners.forEach((listener) => {
        listener();
      });
    },
    [key],
  );
  return [value, setValue] as const;
}
