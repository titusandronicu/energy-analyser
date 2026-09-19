// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  site: "https://neil170-20170.mikrus.cloud",
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: node({ mode: "standalone" }),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_ANON_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      ALLOW_SIGNUP: envField.string({ context: "server", access: "secret", optional: true, default: "false" }),
      APP_VERSION: envField.string({ context: "server", access: "secret", optional: true, default: "development" }),
    },
  },
});
