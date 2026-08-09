import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname,"src"),
      "server-only": resolve(import.meta.dirname,"test/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/lib/validation/**/*.ts",
        "src/lib/integrations/**/*.ts",
        "src/lib/notifications/**/*.ts",
        "src/lib/scheduling/**/*.ts",
        "src/lib/billing/**/*.ts",
        "src/lib/branding.ts",
      ],
    },
  },
});
