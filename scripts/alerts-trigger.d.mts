// Types for scripts/alerts-trigger.mjs, so the unit test in src/lib/alerts-trigger.test.ts is type-checked.
export const DEFAULT_INTERVAL_SECONDS: number;

export interface TriggerConfig {
  url: string;
  token: string;
  intervalMs: number;
}

export function parseConfig(env: Record<string, string | undefined>): { config: TriggerConfig } | { error: string };

export interface RunResult {
  ok: boolean;
  status: number | null;
  evaluated?: number;
  sent?: number;
  unknown?: number;
  failed?: number;
  error?: "timeout" | "network";
}

export function runOnce(
  config: { url: string; token: string },
  deps?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<RunResult>;

export function main(env?: Record<string, string | undefined>): Promise<void>;
