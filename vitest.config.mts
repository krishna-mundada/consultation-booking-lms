import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const alias = { "@": path.resolve(import.meta.dirname) };

// A fixed timezone with daylight saving makes the date tests deterministic and lets them
// exercise both clock changes (docs/conventions.md C1).
const TZ = "Australia/Melbourne";

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          env: { TZ },
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "ui",
          include: ["tests/ui/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["tests/support/setup-dom.ts"],
          env: { TZ },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/support/global-setup.ts"],
          testTimeout: 20_000,
        },
      },
    ],
  },
});
