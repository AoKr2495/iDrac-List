import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 30000,
  expect: { timeout: 8000 },
  outputDir: "../.cache/browser-results",
  reporter: [
    ["list"],
    ["json", { outputFile: "../.cache/browser-results/results.json" }],
  ],
  use: {
    baseURL: process.env.IDRAC_TEST_URL || "http://127.0.0.1:8089",
    viewport: { width: 1920, height: 1080 },
    trace: "retain-on-failure",
  },
});
