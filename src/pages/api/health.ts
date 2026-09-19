import type { APIRoute } from "astro";
import { APP_VERSION } from "astro:env/server";

export const prerender = false;

export const GET: APIRoute = () => {
  const startedAt = performance.now();
  const responseTimeMs = Number((performance.now() - startedAt).toFixed(3));

  return new Response(
    JSON.stringify({
      status: "ok",
      version: APP_VERSION,
      responseTimeMs,
    }),
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
};
