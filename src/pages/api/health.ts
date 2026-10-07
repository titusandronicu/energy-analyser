import type { APIRoute } from "astro";
import { APP_VERSION } from "astro:env/server";
import { jsonNoStore } from "@/lib/http";

export const prerender = false;

export const GET: APIRoute = () => {
  const startedAt = performance.now();
  const responseTimeMs = Number((performance.now() - startedAt).toFixed(3));

  return jsonNoStore(200, {
    status: "ok",
    version: APP_VERSION,
    responseTimeMs,
  });
};
