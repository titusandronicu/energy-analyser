import { validateIngestPayload, type IngestPayloadV1 } from "@/lib/ingest/contract";

export const MAX_INGEST_BODY_BYTES = 256 * 1024;

export interface IngestRpcResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

export interface IngestDeps {
  tokenOk: (token: string) => PromiseLike<IngestRpcResult>;
  rpc: (token: string, payload: IngestPayloadV1) => PromiseLike<IngestRpcResult>;
  now: () => Date;
  logError?: (message: string, detail: unknown) => void;
}

export interface IngestResponse {
  status: number;
  body: Record<string, unknown>;
}

// One body for every token failure so callers can't tell missing, unknown and revoked apart.
const UNAUTHORIZED: IngestResponse = { status: 401, body: { error: "unauthorized" } };
const TOO_LARGE: IngestResponse = { status: 413, body: { error: "payload too large" } };

function bearerToken(request: Request) {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get("Authorization") ?? "");
  return match?.[1] ?? null;
}

// Reads at most `limit` bytes; returns null as soon as the body exceeds it, whatever Content-Length says.
async function readBodyWithLimit(request: Request, limit: number) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

// A stage either hands its value to the next one or ends the request with a response.
type Step<T> = { ok: true; value: T } | { ok: false; response: IngestResponse };

function proceed<T>(value: T): Step<T> {
  return { ok: true, value };
}

function stop(response: IngestResponse): Step<never> {
  return { ok: false, response };
}

function requireToken(request: Request): Step<string> {
  const token = bearerToken(request);
  return token ? proceed(token) : stop(UNAUTHORIZED);
}

// A cheap check before the body is read, so an unknown token gets 401 whatever the body holds. The store checks the
// token again: it may have been revoked in between.
async function checkToken(token: string, deps: IngestDeps): Promise<Step<string>> {
  const { data, error } = await deps.tokenOk(token);
  if (error) {
    deps.logError?.("ingest_token_ok failed", error);
    return stop({ status: 500, body: { error: "ingest failed" } });
  }
  return data === true ? proceed(token) : stop(UNAUTHORIZED);
}

// Content-Length is only a hint, so the streamed read below enforces the cap too.
async function readBody(request: Request): Promise<Step<string>> {
  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_INGEST_BODY_BYTES) return stop(TOO_LARGE);
  const raw = await readBodyWithLimit(request, MAX_INGEST_BODY_BYTES);
  return raw === null ? stop(TOO_LARGE) : proceed(raw);
}

function parseJson(raw: string): Step<unknown> {
  try {
    return proceed(JSON.parse(raw));
  } catch {
    return stop({ status: 400, body: { error: "invalid JSON" } });
  }
}

function validate(json: unknown, now: Date): Step<IngestPayloadV1> {
  const parsed = validateIngestPayload(json, now);
  if (parsed.success) return proceed(parsed.data);
  // zod always reports at least one issue on failure.
  const [issue] = parsed.error.issues;
  return stop({ status: 422, body: { error: "invalid payload", path: issue.path.join("."), message: issue.message } });
}

async function store(token: string, payload: IngestPayloadV1, deps: IngestDeps): Promise<IngestResponse> {
  const { data, error } = await deps.rpc(token, payload);
  if (error) {
    if (error.code === "P0401") return UNAUTHORIZED;
    if (error.code === "P0409") return { status: 409, body: { error: "capture time conflict" } };
    deps.logError?.("ingest_push failed", error);
    return { status: 500, body: { error: "ingest failed" } };
  }

  const status = (data as { status?: unknown } | null)?.status;
  if (status === "created") return { status: 201, body: { status: "created" } };
  if (status === "duplicate") return { status: 200, body: { status: "duplicate" } };
  deps.logError?.("ingest_push returned an unexpected result", data);
  return { status: 500, body: { error: "ingest failed" } };
}

export async function handleIngest(request: Request, deps: IngestDeps): Promise<IngestResponse> {
  const token = requireToken(request);
  if (!token.ok) return token.response;

  const live = await checkToken(token.value, deps);
  if (!live.ok) return live.response;

  const raw = await readBody(request);
  if (!raw.ok) return raw.response;

  const json = parseJson(raw.value);
  if (!json.ok) return json.response;

  const payload = validate(json.value, deps.now());
  if (!payload.ok) return payload.response;

  return store(token.value, payload.value, deps);
}
