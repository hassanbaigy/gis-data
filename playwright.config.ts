import { defineConfig, devices } from "@playwright/test";

/**
 * Repo-wide Playwright config. Per-story specs live in tests/e2e/.
 * See .claude/skills/tdd-user-story/SKILL.md for the loop this config supports.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // worktrees give parallelism across stories; tests inside a story run serial
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["html", { outputFolder: "tests/playwright-report", open: "never" }], ["list"]],
  use: {
    baseURL: process.env.PW_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
