import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";

// Shared by the server-rendered pages that load several sections: each section fails on its own, and the page never
// throws a 500 for a data problem.

// A section whose data failed to load shows its load error (null) and leaves the others intact.
export async function orLoadError<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    // eslint-disable-next-line no-console -- server-side detail; the page shows a generic load error
    console.error(error);
    return null;
  }
}

// One Supabase client per page request, so an expired session is refreshed once instead of by each section in
// parallel. It is created on the first loader's call, so a configuration error still shows as each section's load
// error, and without a configuration (null) each section shows its empty state.
export function pageClient(requestHeaders: Headers, cookies: AstroCookies): () => ReturnType<typeof createClient> {
  let client: ReturnType<typeof createClient> | undefined;
  return () => {
    if (client === undefined) client = createClient(requestHeaders, cookies);
    return client;
  };
}
