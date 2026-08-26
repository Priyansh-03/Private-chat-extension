import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Mirrors esbuild.config.mjs's `define` — these three are build-time constants in the real
  // extension build (see src/lib/backendConfig.ts); Vite's own define does the same substitution
  // for tests, since vi.stubGlobal doesn't reach bare (undeclared) identifiers in ESM.
  define: {
    __USE_REAL_BACKEND__: "true",
    __BACKEND_HTTP_URL__: JSON.stringify("http://test"),
    __BACKEND_WS_URL__: JSON.stringify("ws://test"),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
  },
});
