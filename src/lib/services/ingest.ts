import { validateIngestPayload, type IngestPayloadV1 } from "@/lib/ingest/contract";

export const MAX_INGEST_BODY_BYTES = 256 * 1024;

export interface IngestRpcResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

export interface IngestDeps {
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

export async function handleIngest(request: Request, deps: IngestDeps): Promise<IngestResponse> {
  const token = bearerToken(request);
  if (!token) return UNAUTHORIZED;

  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_INGEST_BODY_BYTES) return TOO_LARGE;
  const raw = await readBodyWithLimit(request, MAX_INGEST_BODY_BYTES);
  if (raw === null) return TOO_LARGE;

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { status: 400, body: { error: "invalid JSON" } };
  }

  const parsed = validateIngestPayload(json, deps.now());
  if (!parsed.success) {
    // zod always reports at least one issue on failure.
    const [issue] = parsed.error.issues;
    return { status: 422, body: { error: "invalid payload", path: issue.path.join("."), message: issue.message } };
  }

  const { data, error } = await deps.rpc(token, parsed.data);
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
