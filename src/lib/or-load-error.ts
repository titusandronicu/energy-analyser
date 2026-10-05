import type { Logger } from "@/lib/logger";

// Shared by the server-rendered pages that load several sections: each section fails on its own, and the page never
// throws a 500 for a data problem.

// A section whose data failed to load shows its load error (null) and leaves the others intact. The failure is logged
// once with the section's name, so a line says which card broke; the page shows a generic message.
export async function orLoadError<T>(section: string, load: () => Promise<T>, log: Logger): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    log.error("section_load_failed", { section, err: error });
    return null;
  }
}
