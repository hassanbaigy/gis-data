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
    // Probe a static-200 route so this readiness check is independent of the
    // app's auth/redirect state. With HF-001's root redirect gate, `/` is
    // 307 → 404 until `/login` (and later `/map`) exist, which Playwright
    // would interpret as "not ready". `/api/health/db` is a stable 200.
    url: "http://localhost:3000/api/health/db",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
