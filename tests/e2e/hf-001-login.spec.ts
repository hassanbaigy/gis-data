import { test, expect } from "@playwright/test";

/**
 * HF-001 — Mock auth + /login screen
 *
 * Failing-first spec. All 6 tests MUST fail until the implementation lands:
 *   - src/app/login/page.tsx
 *   - src/app/api/auth/sign-in/route.ts
 *   - src/app/page.tsx (redirect gate)
 *
 * AC source: STORY.md "## Acceptance criteria" + "## AC → Playwright test map"
 * Decisions: D1 (httpOnly, sameSite Lax, secure=false in dev),
 *            D2 (maxAge 8h), D3 ({ ok: true } JSON), D4 (form always renders)
 */

test.describe("HF-001 /login screen", () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page, context }) => {
    consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    // Clear all cookies so tests don't bleed state into each other.
    // Note: Playwright's clearCookies() clears httpOnly cookies too — it
    // operates at the browser-context level, not via document.cookie.
    await context.clearCookies();
  });

  test.afterEach(async ({ page }) => {
    // Assert zero browser-console error messages.
    // Next.js dev mode can be noisy with warnings; we only gate on `error` type.
    //
    // Known-expected: /map does not exist until HF-005. Tests that intentionally
    // land on /map (tests 4 and 6 per the AC↔test map in STORY.md) will see
    // a "Failed to load resource: ... 404 (Not Found)" console error from the
    // missing page. Filter that one specific message out when the current page
    // URL is /map. Any other error-level console message still fails the test.
    const url = page.url();
    const isOnMap = url.includes("/map");
    const filtered = consoleErrors.filter((msg) => {
      if (
        isOnMap &&
        msg.includes("Failed to load resource") &&
        msg.includes("404")
      ) {
        return false;
      }
      return true;
    });
    expect(
      filtered,
      `unexpected console errors:\n${filtered.join("\n")}`,
    ).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Test 1 — Brand block, badge input, PIN pad, and SIGN IN CTA render
  // AC: Visiting `/login` renders: brand block … subtitle … badge input … PIN pad … CTA
  // ---------------------------------------------------------------------------
  test("renders brand block, badge input, PIN pad, and SIGN IN CTA", async ({
    page,
  }) => {
    await page.goto("/login");

    // Brand block — heading containing "HYDRANT FINDER"
    const heading = page.getByRole("heading", { name: /hydrant finder/i });
    await expect(heading).toBeVisible();

    // Subtitle — "FDNY · v0.1 PROTO"
    const subtitle = page.getByText(/fdny\s*·\s*v0\.1\s*proto/i);
    await expect(subtitle).toBeVisible();

    // Badge input — single 4-digit text input
    const badgeInput = page.getByRole("textbox", { name: /badge/i });
    await expect(badgeInput).toBeVisible();

    // PIN pad — 4 individual cells; each has an accessible label "PIN digit N"
    const pinCells = page.getByRole("textbox", { name: /pin digit/i });
    await expect(pinCells).toHaveCount(4);
    for (const cell of await pinCells.all()) {
      await expect(cell).toBeVisible();
    }

    // SIGN IN CTA button
    const cta = page.getByRole("button", { name: /sign in/i });
    await expect(cta).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/hf-001-login/01-login-empty-state.png",
      fullPage: true,
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2 — CTA disabled when badge has fewer than 4 digits
  // AC: Submitting fewer than 4 digits in either field disables the CTA
  //     (opacity 0.5, aria-disabled="true")
  // ---------------------------------------------------------------------------
  test("disables CTA when badge has fewer than 4 digits", async ({ page }) => {
    await page.goto("/login");

    const badgeInput = page.getByRole("textbox", { name: /badge/i });
    const pinCells = page.getByRole("textbox", { name: /pin digit/i });
    const cta = page.getByRole("button", { name: /sign in/i });

    // Partial badge (2 digits) — PIN is fully filled so only badge is incomplete
    await badgeInput.fill("12");

    const cells = await pinCells.all();
    // Fill all 4 PIN cells with one digit each
    for (let i = 0; i < cells.length; i++) {
      await cells[i].fill(String(i + 1)); // "1", "2", "3", "4"
    }

    // CTA must carry aria-disabled="true"
    await expect(cta).toHaveAttribute("aria-disabled", "true");

    // CTA must be visually dimmed — opacity ≤ 0.5
    const opacity = await cta.evaluate(
      (el) => parseFloat(getComputedStyle(el).opacity),
    );
    expect(
      opacity,
      `expected CTA opacity ≤ 0.5, got ${opacity}`,
    ).toBeLessThanOrEqual(0.5);

    // Clicking a disabled CTA must not navigate away from /login
    await cta.click({ force: true });
    expect(page.url()).toContain("/login");

    await page.screenshot({
      path: "tests/screenshots/hf-001-login/02-partial-badge-cta-disabled.png",
      fullPage: true,
    });
  });

  // ---------------------------------------------------------------------------
  // Test 3 — CTA disabled when PIN has fewer than 4 cells filled
  // AC: Submitting fewer than 4 digits in either field disables the CTA
  // ---------------------------------------------------------------------------
  test("disables CTA when PIN has fewer than 4 cells filled", async ({
    page,
  }) => {
    await page.goto("/login");

    const badgeInput = page.getByRole("textbox", { name: /badge/i });
    const pinCells = page.getByRole("textbox", { name: /pin digit/i });
    const cta = page.getByRole("button", { name: /sign in/i });

    // Badge is valid (4 digits) — only PIN is incomplete
    await badgeInput.fill("1234");

    // Fill only 2 of the 4 PIN cells
    const cells = await pinCells.all();
    await cells[0].fill("7");
    await cells[1].fill("8");
    // cells[2] and cells[3] left empty

    // CTA must carry aria-disabled="true"
    await expect(cta).toHaveAttribute("aria-disabled", "true");

    // CTA must be visually dimmed — opacity ≤ 0.5
    const opacity = await cta.evaluate(
      (el) => parseFloat(getComputedStyle(el).opacity),
    );
    expect(
      opacity,
      `expected CTA opacity ≤ 0.5, got ${opacity}`,
    ).toBeLessThanOrEqual(0.5);

    // Clicking must not navigate away from /login
    await cta.click({ force: true });
    expect(page.url()).toContain("/login");

    await page.screenshot({
      path: "tests/screenshots/hf-001-login/03-partial-pin-cta-disabled.png",
      fullPage: true,
    });
  });

  // ---------------------------------------------------------------------------
  // Test 4 — Valid 4+4 submission sets hf_badge cookie and navigates to /map
  // AC: Submitting any 4-digit badge + 4-digit PIN sets an http-only cookie
  //     hf_badge=<badge> and redirects to /map.
  // Decisions: D1 (httpOnly, sameSite Lax, secure=false in dev), D2 (maxAge 8h)
  // NOTE: /map does not exist until HF-005. We assert the URL only, never page
  //       content at /map, so the test won't become a false negative once HF-005
  //       ships a real page at that route.
  // ---------------------------------------------------------------------------
  test("valid 4+4 submission sets hf_badge cookie and navigates to /map", async ({
    page,
  }) => {
    await page.goto("/login");

    const badgeInput = page.getByRole("textbox", { name: /badge/i });
    const pinCells = page.getByRole("textbox", { name: /pin digit/i });
    const cta = page.getByRole("button", { name: /sign in/i });

    // Fill badge with "0418"
    await badgeInput.fill("0418");

    // Fill each PIN cell individually: 1, 2, 3, 4
    const cells = await pinCells.all();
    await cells[0].fill("1");
    await cells[1].fill("2");
    await cells[2].fill("3");
    await cells[3].fill("4");

    // Click SIGN IN
    await cta.click();

    // Wait for navigation to /map (the route won't exist until HF-005 —
    // so this waitForURL will time out in the failing-first run, which is correct)
    await page.waitForURL(/\/map/, { timeout: 5000 });

    // URL must contain /map
    expect(page.url()).toContain("/map");

    // Verify hf_badge cookie via Playwright's context.cookies() API —
    // httpOnly cookies are NOT readable via document.cookie.
    const cookies = await page.context().cookies();
    const hfBadge = cookies.find((c) => c.name === "hf_badge");

    expect(hfBadge, "hf_badge cookie must exist after valid sign-in").toBeDefined();
    // Value must equal the submitted badge
    expect(hfBadge?.value).toBe("0418");
    // D1 — cookie flags
    expect(hfBadge?.httpOnly).toBe(true);
    expect(hfBadge?.sameSite).toBe("Lax");
    expect(hfBadge?.path).toBe("/");
    // D1 — secure=false in dev (NODE_ENV=development, http://localhost)
    expect(hfBadge?.secure).toBe(false);
    // D2 — maxAge 8 hours; cookie expires > 7 hours from now
    const sevenHoursFromNow = Math.floor(Date.now() / 1000) + 60 * 60 * 7;
    expect(
      hfBadge?.expires,
      "hf_badge cookie must expire more than 7 hours from now (8h maxAge per D2)",
    ).toBeGreaterThan(sevenHoursFromNow);

    await page.screenshot({
      path: "tests/screenshots/hf-001-login/04-post-redirect-to-map.png",
      fullPage: true,
    });
  });

  // ---------------------------------------------------------------------------
  // Test 5 — / with no cookie redirects to /login
  // AC: Visiting `/` with no cookie redirects to /login.
  // ---------------------------------------------------------------------------
  test("/ with no cookie redirects to /login", async ({ page }) => {
    // beforeEach already called clearCookies(); belt-and-suspenders inline clear
    await page.context().clearCookies();

    await page.goto("/");

    // Wait for the redirect to complete — the redirect gate in src/app/page.tsx
    // (requireBadge) sends the browser to /login when hf_badge is absent.
    await page.waitForURL(/\/login/, { timeout: 5000 });

    expect(page.url()).toContain("/login");

    // Prove we're on the /login page (not a 404) by asserting the brand heading
    const heading = page.getByRole("heading", { name: /hydrant finder/i });
    await expect(heading).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/hf-001-login/05-root-no-cookie-redirect.png",
      fullPage: true,
    });
  });

  // ---------------------------------------------------------------------------
  // Test 6 — / with hf_badge cookie redirects to /map
  // AC: Visiting `/` with the cookie redirects to /map.
  // NOTE: /map 404s until HF-005; assert URL only, never page content at /map.
  // ---------------------------------------------------------------------------
  test("/ with hf_badge cookie redirects to /map", async ({ page, context }) => {
    // Pre-seed the hf_badge cookie so the redirect gate sees an authenticated user.
    // Matches D1 flags (httpOnly, sameSite Lax, secure=false in dev) + D2 lifetime.
    await context.addCookies([
      {
        name: "hf_badge",
        value: "0418",
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: false,
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
      },
    ]);

    await page.goto("/");

    // Wait for the redirect gate to send us to /map
    await page.waitForURL(/\/map/, { timeout: 5000 });

    expect(page.url()).toContain("/map");

    await page.screenshot({
      path: "tests/screenshots/hf-001-login/06-root-with-cookie-redirect.png",
      fullPage: true,
    });
  });
});
