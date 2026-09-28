import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/regression-results.json" }],
  ],
  use: {
    timezoneId: "Asia/Shanghai",
    baseURL: "http://127.0.0.1:3000",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      process.env.PAGES_BUILD === "1"
        ? "npm run preview:pages"
        : "npm run start -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
  },
});
