// A page section's loader through the page's lazily created client: with no client (Supabase not configured) the
// section gets its empty `fallback` and `load` never runs; otherwise it gets what `load` returns. Errors are not caught
// here, so orLoadError still logs them under the section's name.
export async function withClient<C, T>(
  getClient: () => C | null,
  load: (client: C) => Promise<T>,
  fallback: T,
): Promise<T> {
  const client = getClient();
  return client === null ? fallback : await load(client);
}
