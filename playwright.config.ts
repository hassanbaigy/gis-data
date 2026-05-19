import { defineConfig, devices } from "@playwright/test";

/**
 * Repo-wide Playwright config. Per-story specs live in tests/e2e/.
 * See .claude/skills/tdd-user-story/SKILL.md for the loop this config supports.
 *
 * HF-010 D3: default viewport switched from `devices["Desktop Chrome"]`
 * (1280×720) to a plain phone-size viewport (390×844). HF-010 introduced
 * the `lg:` breakpoint at 900px (see globals.css `--breakpoint-lg`), so
 * the previous Desktop Chrome default would have all 59 existing tests
 * see the tablet rail layout and fail phone-layout assertions. We use
 * raw `{ viewport }` rather than `devices["iPhone 13"]` to avoid
 * `isMobile: true` and the mobile user-agent string side effects on
 * tests that don't expect them. Per-spec overrides (HF-010's tablet
 * spec) set their own viewport via `test.use({ viewport: ... })`.
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
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // HF-010 — phone-size default. Override `viewport` after spreading
        // the Desktop Chrome preset so its UA / device-scale carries through
        // (we just need phone width + height).
        viewport: { width: 390, height: 844 },
      },
    },
  ],
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
