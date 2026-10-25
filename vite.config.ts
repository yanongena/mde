import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ command }) => ({
  base: "./",
  optimizeDeps: {
    include: [
      "@tiptap/extension-paragraph",
      "@tiptap/pm/state",
      "@tiptap/pm/history",
      "@tiptap/core",
      "@tiptap/pm/view",
      "unified",
      "remark-parse",
      "remark-gfm",
    ],
  },
  plugins: [
    react(),
    {
      name: "development-csp",
      transformIndexHtml(html) {
        return command === "serve"
          ? html.replace(
              "script-src 'self'",
              "script-src 'self' 'unsafe-inline'",
            )
          : html;
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/test-results/**",
        "**/playwright-report/**",
        "**/release/**",
        "**/.dev-data/**",
      ],
    },
  },
  build: { chunkSizeWarningLimit: 1800 },
  worker: { format: "es" },
}));
