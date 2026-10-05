import { createHash } from "node:crypto";

// One structured JSON line per event, tagged with the release and the environment, so a log line can be tied to a
// deploy, a request and a failure without a tracker. Pure: the version and environment are passed in (astro:env/server
// does not resolve under vitest), and `write` is injectable.

export type LogFields = Record<string, unknown>;

export interface Logger {
  error(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  // A logger that adds `fields` to every line it writes (for example the request id).
  child(fields: LogFields): Logger;
}

interface LoggerOptions {
  version: string;
  environment: string;
  fields?: LogFields;
  write?: (line: string) => void;
  now?: () => Date;
}

const MAX_CAUSE_DEPTH = 3;
// Keys a line always owns: a caller's field of the same name is ignored rather than allowed to overwrite them.
const STANDARD_KEYS = new Set(["ts", "level", "event", "version", "env"]);
const ERROR_KEYS = ["name", "message", "code", "status", "details", "hint", "stack"] as const;

const MAX_DESCRIBED_CHARS = 500;

function describe(value: object): string {
  try {
    return JSON.stringify(value).slice(0, MAX_DESCRIBED_CHARS);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

// An Error, or the plain `{ message, code, details, hint }` object Supabase returns (it has no stack), as plain data.
// `cause` is followed up to MAX_CAUSE_DEPTH levels; anything that is not an object becomes `{ value }`.
export function serializeError(value: unknown, depth = 0): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return { value: String(value) };
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ERROR_KEYS) {
    const field = source[key];
    if (typeof field === "string" || typeof field === "number") out[key] = field;
  }
  if (source.cause !== undefined && depth < MAX_CAUSE_DEPTH) out.cause = serializeError(source.cause, depth + 1);
  // An object with none of those keys (an unexpected RPC result, say) is kept as short JSON rather than lost.
  if (Object.keys(out).length === 0) out.value = describe(value);
  return out;
}

// First 8 hex characters of the SHA-256 of the trimmed, lower-cased email: ties repeated failures together without
// writing an address into the log.
export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 8);
}

// A logger that tags its lines with the address's hash, or the same logger when there is no usable address.
export function withEmailHash(log: Logger, email: unknown): Logger {
  return typeof email === "string" && email.trim() !== "" ? log.child({ emailHash: emailHash(email) }) : log;
}

function defaultWrite(line: string): void {
  // eslint-disable-next-line no-console -- the one place that writes to the container's log stream
  console.error(line);
}

function stringify(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record);
  } catch {
    // A field that cannot be serialized (a circular object, a bigint) must not lose the event itself.
    return JSON.stringify({
      ts: record.ts,
      level: record.level,
      event: record.event,
      logError: "unserializable fields",
    });
  }
}

export function createLogger(options: LoggerOptions): Logger {
  const { version, environment, write = defaultWrite, now = () => new Date() } = options;
  const bound = options.fields ?? {};

  const emit = (level: "error" | "warn", event: string, fields: LogFields = {}) => {
    const { err, ...rest } = fields;
    const record: Record<string, unknown> = { ts: now().toISOString(), level, event, version, env: environment };
    for (const [key, value] of Object.entries({ ...bound, ...rest })) {
      if (!STANDARD_KEYS.has(key)) record[key] = value;
    }
    if ("err" in fields) record.err = serializeError(err);
    write(stringify(record));
  };

  return {
    error: (event, fields) => {
      emit("error", event, fields);
    },
    warn: (event, fields) => {
      emit("warn", event, fields);
    },
    child: (fields) => createLogger({ ...options, fields: { ...bound, ...fields } }),
  };
}
