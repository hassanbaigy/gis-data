import { test, expect } from "@playwright/test";
import { loginInContext, authedRequestContext } from "./helpers/auth";

/**
 * HF-005 — /map home screen + GET /api/incidents
 *
 * Failing-first spec committed BEFORE the implementation lands.
 * Expected failure modes on first run:
 *   - Browser tests 01-07: /map returns 404 → headings/buttons/chips not found
 *   - Test 08 (unauth redirect): may pass coincidentally (layout gate already redirects)
 *   - API tests 09, 11-14: GET /api/incidents returns 405 (only POST exists) → assertions fail
 *   - API test 10 (no cookie + 401): may pass coincidentally (405 before auth check)
 *
 * Decisions honoured:
 *   D1 — [ALL · N] / [7 DAYS] are a radio-like pair; [UNIT E-12] is independent.
 *         On first load: 7 DAYS active (aria-pressed=true), ALL · N smoke, UNIT E-12 active.
 *   D2 — SOS stub: aria-label="SOS — not yet active"
 *   D3 — Zero-incidents fallback: Gorham centroid [-70.444, 43.679]
 *   D4 — /history 404 until HF-009; assert URL only.
 *
 * Test seam: MapView exposes <div data-hf-map-state data-status data-marker-count
 *            data-marker-types data-has-route> so Playwright can assert without
 *            reading the WebGL canvas.
 */

// ---------------------------------------------------------------------------
// Browser tests
// ---------------------------------------------------------------------------

test.describe("HF-005 /map home screen", () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page, context }) => {
    consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    // Short-circuit auth: inject the demo badge cookie directly.
    // The seeded firefighter (badge 0418, unit E-12) is guaranteed to exist.
    await loginInContext(context);
  });

  test.afterEach(async ({ page }) => {
    // Filter the expected 404 from /history (HF-009 not yet shipped — D4).
    const url = page.url();
    const filtered = consoleErrors.filter((msg) => {
      if (
        url.includes("/history") &&
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

  // -------------------------------------------------------------------------
  // Test 01 — full layout on /map after login
  // -------------------------------------------------------------------------
  test("renders dark map top bar filter chips hint card and footer on /map after login", async ({
    page,
  }) => {
    await page.goto("/map");

    // Wait for the map to be fully rendered (data-status="ready" fires on Mapbox
    // `load` event, after style.load + first tiles). 15s timeout for real network.
    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Top bar — badge plate
    await expect(page.getByText(/badge\s*0418/i)).toBeVisible();

    // Top bar — SOS button (D2: aria-label="SOS — not yet active")
    await expect(
      page.getByRole("button", { name: /sos/i }),
    ).toBeVisible();

    // Filter chip rail — three chips
    await expect(page.getByRole("button", { name: /all/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /7\s*days/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /unit\s*e-12/i })).toBeVisible();

    // Bottom hint card — "LAST INCIDENT" label
    await expect(page.getByText(/last\s*incident/i)).toBeVisible();

    // Persistent footer — + NEW INCIDENT CTA
    await expect(
      page.getByRole("link", { name: /new\s*incident/i }),
    ).toBeVisible();

    // Persistent footer — list icon → /history (role may be link or button)
    const historyNav =
      page.getByRole("link", { name: /history/i }).or(
        page.getByRole("button", { name: /history/i }),
      );
    await expect(historyNav).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/hf-005-home/01-home-loaded.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 02 — marker count >= 6 after first load
  // -------------------------------------------------------------------------
  test("shows 6 incident markers on the map", async ({ page }) => {
    await page.goto("/map");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Use >= 6 (not exactly 6) because POST tests in this run may have added rows.
    const rawCount = await stateEl.getAttribute("data-marker-count");
    const count = parseInt(rawCount ?? "0", 10);
    expect(
      count,
      `expected >= 6 incident markers, got data-marker-count="${rawCount}"`,
    ).toBeGreaterThanOrEqual(6);

    // Verify marker type token — past-incident markers are type "incident".
    const markerTypes = await stateEl.getAttribute("data-marker-types");
    expect(
      markerTypes,
      `expected data-marker-types to include "incident", got "${markerTypes}"`,
    ).toContain("incident");

    await page.screenshot({
      path: "tests/screenshots/hf-005-home/02-marker-count.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 03 — filter chip labels and initial active states (D1)
  // -------------------------------------------------------------------------
  test("filter chips display ALL count 7 DAYS chip and UNIT E-12 chip", async ({
    page,
  }) => {
    await page.goto("/map");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // "ALL · N" chip: label matches /all\s*·\s*\d+/i
    const allChip = page.getByRole("button", { name: /all\s*·\s*\d+/i });
    await expect(allChip).toBeVisible();

    // "7 DAYS" chip
    const sevenDaysChip = page.getByRole("button", { name: /7\s*days/i });
    await expect(sevenDaysChip).toBeVisible();

    // "UNIT E-12" chip
    const unitChip = page.getByRole("button", { name: /unit\s*e-12/i });
    await expect(unitChip).toBeVisible();

    // D1 — initial active states:
    //   [7 DAYS]   → active  (aria-pressed="true")
    //   [ALL · N]  → inactive (aria-pressed="false")
    //   [UNIT E-12] → active  (aria-pressed="true")
    await expect(sevenDaysChip).toHaveAttribute("aria-pressed", "true");
    await expect(allChip).toHaveAttribute("aria-pressed", "false");
    await expect(unitChip).toHaveAttribute("aria-pressed", "true");

    await page.screenshot({
      path: "tests/screenshots/hf-005-home/03-filter-chips.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 04 — + NEW INCIDENT CTA navigates to /map/new
  // -------------------------------------------------------------------------
  test("tapping + NEW INCIDENT navigates to /map/new", async ({ page }) => {
    await page.goto("/map");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    const cta = page.getByRole("link", { name: /new\s*incident/i });
    await cta.click();

    await page.waitForURL(/\/map\/new$/, { timeout: 10_000 });
    expect(page.url()).toContain("/map/new");

    await page.screenshot({
      path: "tests/screenshots/hf-005-home/04-nav-new-incident.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 05 — list icon navigates to /history (D4: assert URL only)
  // -------------------------------------------------------------------------
  test("tapping the list icon navigates to /history", async ({ page }) => {
    await page.goto("/map");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // The list icon is either a <Link> or a <button>; try link first.
    const historyNav =
      page.getByRole("link", { name: /history/i }).or(
        page.getByRole("button", { name: /history/i }),
      );
    await historyNav.click();

    await page.waitForURL(/\/history$/, { timeout: 10_000 });
    expect(page.url()).toContain("/history");
    // D4: do NOT assert page content — /history 404s until HF-009.

    await page.screenshot({
      path: "tests/screenshots/hf-005-home/05-nav-history.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 06 — hint card shows most-recent incident address
  // -------------------------------------------------------------------------
  test("hint card shows most-recent incident address", async ({
    page,
    playwright,
  }) => {
    // Fetch the most-recent incident independently so we know the expected address.
    const ctx = await authedRequestContext(playwright);
    const apiRes = await ctx.get("/api/incidents?since=7d");
    expect(apiRes.status()).toBe(200);
    const apiBody = (await apiRes.json()) as {
      incidents: Array<{ address: string; createdAt: string }>;
    };
    expect(apiBody.incidents.length).toBeGreaterThan(0);
    // Ordered DESC — first element is most recent.
    const mostRecentAddress = apiBody.incidents[0].address;
    await ctx.dispose();

    await page.goto("/map");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Hint card must show "LAST INCIDENT" label
    await expect(page.getByText(/last\s*incident/i)).toBeVisible();

    // Hint card must show the most-recent incident's address
    await expect(page.getByText(mostRecentAddress)).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/hf-005-home/06-hint-card.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 07 — tapping 7 DAYS chip re-fetches; marker count can only grow
  // -------------------------------------------------------------------------
  test("tapping 7 DAYS chip re-fetches and map state updates", async ({
    page,
  }) => {
    await page.goto("/map");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Record marker count before the toggle.
    const beforeRaw = await stateEl.getAttribute("data-marker-count");
    const beforeCount = parseInt(beforeRaw ?? "0", 10);

    // Click [7 DAYS] to deactivate the time filter → ALL becomes active (D1).
    const sevenDaysChip = page.getByRole("button", { name: /7\s*days/i });
    await sevenDaysChip.click();

    // Wait for chip rail to update: [7 DAYS] becomes inactive, [ALL · N] active.
    await expect(sevenDaysChip).toHaveAttribute("aria-pressed", "false", {
      timeout: 10_000,
    });
    const allChip = page.getByRole("button", { name: /all\s*·\s*\d+/i });
    await expect(allChip).toHaveAttribute("aria-pressed", "true", {
      timeout: 5_000,
    });

    // Map re-fetches: wait for "ready" again (may momentarily drop to "loading").
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Toggling to "all" can only add markers (never remove); allow equality.
    const afterRaw = await stateEl.getAttribute("data-marker-count");
    const afterCount = parseInt(afterRaw ?? "0", 10);
    expect(
      afterCount,
      `expected marker count after "all" toggle (${afterCount}) >= before count (${beforeCount})`,
    ).toBeGreaterThanOrEqual(beforeCount);

    await page.screenshot({
      path: "tests/screenshots/hf-005-home/07-chip-toggle.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 08 — unauthenticated GET /map redirects to /login
  // -------------------------------------------------------------------------
  test("unauthenticated GET /map redirects to /login", async ({ browser }) => {
    // Fresh context — no loginInContext() called here (beforeEach injects into
    // `context`, not into this fresh context).
    const fresh = await browser.newContext();
    const page = await fresh.newPage();

    await page.goto("/map");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");

    await page.screenshot({
      path: "tests/screenshots/hf-005-home/08-unauthed-redirect.png",
      fullPage: true,
    });

    await fresh.close();
  });
});

// ---------------------------------------------------------------------------
// API tests — GET /api/incidents
// ---------------------------------------------------------------------------

test.describe("HF-005 GET /api/incidents", () => {
  // -------------------------------------------------------------------------
  // Test 09 — 200 with >= 6 seeded incidents ordered DESC
  // -------------------------------------------------------------------------
  test("GET /api/incidents?since=7d returns 6 seeded incidents ordered createdAt DESC", async ({
    playwright,
  }) => {
    const ctx = await authedRequestContext(playwright);
    const res = await ctx.get("/api/incidents?since=7d");

    expect(res.status()).toBe(200);

    const body = (await res.json()) as {
      incidents: Array<{
        id: string;
        createdAt: string;
        address: string;
        lat: number;
        lng: number;
        type: string;
        alarmLevel: number;
        unitId: string;
        chosenHydrantId: string | null;
      }>;
    };

    expect(body.incidents.length).toBeGreaterThanOrEqual(6);

    // Verify expected fields on each incident.
    for (const incident of body.incidents) {
      expect(typeof incident.id).toBe("string");
      expect(incident.id.length).toBeGreaterThan(0);
      expect(typeof incident.createdAt).toBe("string");
      expect(typeof incident.address).toBe("string");
      expect(typeof incident.lat).toBe("number");
      expect(typeof incident.lng).toBe("number");
      expect(typeof incident.type).toBe("string");
      expect(typeof incident.alarmLevel).toBe("number");
      expect(typeof incident.unitId).toBe("string");
      // chosenHydrantId may be null
      expect(
        incident.chosenHydrantId === null ||
          typeof incident.chosenHydrantId === "string",
      ).toBe(true);
    }

    // Verify ordering: each incident's createdAt >= the next one's (DESC).
    for (let i = 0; i < body.incidents.length - 1; i++) {
      const current = new Date(body.incidents[i].createdAt).getTime();
      const next = new Date(body.incidents[i + 1].createdAt).getTime();
      expect(
        current,
        `expected incidents[${i}].createdAt (${body.incidents[i].createdAt}) >= incidents[${i + 1}].createdAt (${body.incidents[i + 1].createdAt})`,
      ).toBeGreaterThanOrEqual(next);
    }

    await ctx.dispose();
  });

  // -------------------------------------------------------------------------
  // Test 10 — no cookie → 401
  // -------------------------------------------------------------------------
  test("GET /api/incidents without cookie returns 401", async ({
    playwright,
  }) => {
    // Vanilla request context — no Cookie header injected.
    const ctx = await playwright.request.newContext({
      baseURL: process.env.PW_BASE_URL ?? "http://localhost:3000",
    });

    const res = await ctx.get("/api/incidents?since=7d");

    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthenticated");

    await ctx.dispose();
  });

  // -------------------------------------------------------------------------
  // Test 11 — ?type=STRUCTURE filters correctly
  // -------------------------------------------------------------------------
  test("GET /api/incidents?type=STRUCTURE filters to only STRUCTURE incidents", async ({
    playwright,
  }) => {
    const ctx = await authedRequestContext(playwright);
    const res = await ctx.get("/api/incidents?since=all&type=STRUCTURE");

    expect(res.status()).toBe(200);

    const body = (await res.json()) as {
      incidents: Array<{ type: string }>;
    };

    // Seed has at least 2 STRUCTURE incidents.
    expect(body.incidents.length).toBeGreaterThanOrEqual(2);

    // Every returned incident must be STRUCTURE.
    for (const incident of body.incidents) {
      expect(incident.type).toBe("STRUCTURE");
    }

    await ctx.dispose();
  });

  // -------------------------------------------------------------------------
  // Test 12 — ?since=invalid → 400 invalid_since
  // -------------------------------------------------------------------------
  test("GET /api/incidents?since=invalid returns 400 with error invalid_since", async ({
    playwright,
  }) => {
    const ctx = await authedRequestContext(playwright);
    const res = await ctx.get("/api/incidents?since=bogus");

    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_since");

    await ctx.dispose();
  });

  // -------------------------------------------------------------------------
  // Test 13 — PII fields firefighterId and notes must NOT appear in response
  // -------------------------------------------------------------------------
  test("GET /api/incidents response does not include firefighterId or notes", async ({
    playwright,
  }) => {
    const ctx = await authedRequestContext(playwright);
    const res = await ctx.get("/api/incidents?since=all");

    expect(res.status()).toBe(200);

    // Use raw text scan with quoted key names to avoid substring false positives
    // (e.g. "firefighter" would match if we didn't quote the full key).
    const body = await res.text();
    expect(
      body,
      'response must not contain JSON key "firefighterId"',
    ).not.toContain('"firefighterId"');
    expect(
      body,
      'response must not contain JSON key "notes"',
    ).not.toContain('"notes"');

    await ctx.dispose();
  });

  // -------------------------------------------------------------------------
  // Test 14 — ?since=all returns >= the 7d count
  // -------------------------------------------------------------------------
  test("GET /api/incidents?since=all returns all incidents regardless of date", async ({
    playwright,
  }) => {
    const ctx = await authedRequestContext(playwright);

    const [resAll, resSeven] = await Promise.all([
      ctx.get("/api/incidents?since=all"),
      ctx.get("/api/incidents?since=7d"),
    ]);

    expect(resAll.status()).toBe(200);
    expect(resSeven.status()).toBe(200);

    const bodyAll = (await resAll.json()) as { incidents: unknown[] };
    const bodySeven = (await resSeven.json()) as { incidents: unknown[] };

    expect(
      bodyAll.incidents.length,
      `since=all (${bodyAll.incidents.length}) must be >= since=7d (${bodySeven.incidents.length})`,
    ).toBeGreaterThanOrEqual(bodySeven.incidents.length);

    await ctx.dispose();
  });
});
