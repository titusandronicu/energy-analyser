// The error a loader throws when a Supabase query comes back with `{ error }`. The message keeps the "<what>: <reason>"
// shape the page already shows and the tests assert; the original error rides along as `cause`, so the Postgres code,
// details and hint survive for the log.
export interface QueryErrorLike {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export function queryError(what: string, error: QueryErrorLike): Error {
  return new Error(`${what}: ${error.message}`, { cause: error });
}
