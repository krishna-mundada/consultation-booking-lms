import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

// Same fixed zone as the Vitest projects, for the Node side of the tests (date helpers) and the
// browser, so date assertions do not depend on the machine they run on.
const TIME_ZONE = "Australia/Melbourne";
process.env.TZ = TIME_ZONE;

export default defineConfig({
  testDir: "./tests",
  // Tests create their own users with unique ids (ADR 0004), so they can run in parallel.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL, timezoneId: TIME_ZONE, trace: "retain-on-failure" },
  projects: [
    // HTTP-level tests of the route handlers: no browser needed.
    { name: "api", testMatch: "api/**/*.spec.ts" },
    {
      name: "e2e",
      testMatch: "e2e/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    // The same journeys in the other two engines (`npm run test:browsers`); date and time inputs
    // and form behaviour differ between them.
    {
      name: "e2e-firefox",
      testMatch: "e2e/**/*.spec.ts",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "e2e-webkit",
      testMatch: "e2e/**/*.spec.ts",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
