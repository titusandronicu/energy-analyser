import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";

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
