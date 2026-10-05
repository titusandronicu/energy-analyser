// A per-request id for log correlation. An inbound X-Request-Id (a proxy may add one) is kept only when it is a plain
// token, so a forged header cannot inject markup or control characters into a log line or the 503 page.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestIdFrom(headers: Headers, generate: () => string = () => crypto.randomUUID()): string {
  const inbound = headers.get("x-request-id");
  return inbound !== null && SAFE_REQUEST_ID.test(inbound) ? inbound : generate();
}
