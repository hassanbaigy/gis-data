import { test, expect } from "@playwright/test";
import { loginInContext, authedRequestContext } from "./helpers/auth";

/**
 * HF-008 — Polish /map/incident/[id] results screen
 *
 * Failing-first spec committed BEFORE the implementation lands.
 * Expected failure modes on first run:
 *   - Tests 04, 05: no /ACTIVE/ text (placeholder has none)
 *   - Test 06: no "NEAREST HYDRANTS · 3 of N" header (placeholder says "NEAREST · N of N")
 *   - Tests 07, 08: no [data-rank="N"] elements
 *   - Test 09: no [data-oos="true"] + /OUT/ text
 *   - Test 10: no `maps:?daddr=` href (placeholder has no NAVIGATE link)
 *   - Tests 11, 12: no dialog / list-icon button
 *   - Tests 01, 02, 03, 13: may pass coincidentally (page exists, map renders, auth gate works)
 *
 * Decisions honoured:
 *   D1 — Drag handle is visual-only; not tested (no drag interaction)
 *   D2 — canvas-drawn incident teardrop; not tested (WebGL canvas opaque to Playwright)
 *   D3 — NAVIGATE uses `maps:?daddr=<lat>,<lng>` literally
 *   D4 — List-icon modal shows same data + longer list; role="dialog" + aria-modal="true"
 *
 * IMPLEMENTER NOTES (do not remove):
 *
 * (A) HF-006 regression risk: hf-006-new-incident.spec.ts asserts
 *     `page.getByText(/incident/i).first()` is visible on /map/incident/[id].
 *     The polished bottom-sheet UI must keep some visible text matching
 *     /incident/i. "ACTIVE" does not match; "STRUCTURE" does not match;
 *     "NEAREST HYDRANTS" does not match. Suggested fix: add a small
 *     screen-reader accessible text element or visible label such as
 *     "INCIDENT" in the header, a visible page title, or an aria-label on
 *     the SOS button that includes "incident". Verify HF-006 is still green
 *     after Step D (rewire incident-view.tsx).
 *
 * (B) Modal close button MUST have aria-label="Close" (or "close") so that
 *     Test 12's `getByRole("button", { name: /close/i })` inside
 *     `getByRole("dialog")` resolves. An X icon with no label will fail.
 *
 * (C) List-icon button MUST have an accessible name matching /list|hydrants|expand/i
 *     for Test 11 to resolve. Suggested: aria-label="Show full hydrant list".
 *
 * (D) data-oos="true" attribute MUST be placed on the OOS card element
 *     (or a wrapper) for Test 09 to resolve. The /OUT/ chip must be
 *     a visible descendant of that element.
 *
 * Test seam: MapView exposes <div data-hf-map-state data-status data-marker-count
 *            data-marker-types data-has-route> so Playwright can assert without
 *            reading the WebGL canvas.
 */

// ---------------------------------------------------------------------------
// Shared state populated in beforeAll — real Mapbox API calls happen here.
// ---------------------------------------------------------------------------

let incidentId: string;
let chosenHydrantLat: number;
let chosenHydrantLng: number;
let flaggedOosCount: number;

// ---------------------------------------------------------------------------
// Browser tests
// ---------------------------------------------------------------------------

test.describe("HF-008 /map/incident/[id]", () => {
  test.beforeAll(async ({ playwright }) => {
    // Real Mapbox (geocode + matrix + directions) calls can take 1-3s.
    // Give the full 60s to avoid flaky timeouts in CI.
    test.setTimeout(60_000);

    const ctx = await authedRequestContext(playwright);
    const res = await ctx.post("/api/incidents", {
      data: {
        address: "Main St, Gorham, ME 04038",
        lat: 43.6791,
        lng: -70.4444,
        type: "STRUCTURE",
        alarmLevel: 3,
        unitId: "E-12",
      },
    });

    if (!res.ok()) {
      const body = await res.text();
      throw new Error(
        `beforeAll: POST /api/incidents failed — ${res.status()} ${body}. ` +
          "Check that .env.local has MAPBOX_SECRET_TOKEN and NEXT_PUBLIC_MAPBOX_TOKEN.",
      );
    }

    const body = (await res.json()) as {
      id: string;
      nearest: Array<{
        hydrant: { id: string; lat: number; lng: number };
        durationS: number;
        distanceM: number;
        geometry?: unknown;
      }>;
      flaggedOos: Array<{
        hydrant: { id: string; lat: number; lng: number };
        distanceM: number;
      }>;
    };

    if (!body.id) {
      throw new Error("beforeAll: POST /api/incidents returned no id");
    }
    if (!body.nearest || body.nearest.length === 0) {
      throw new Error(
        "beforeAll: POST /api/incidents returned no nearest hydrants — " +
          "seed DB may be empty or Mapbox matrix call failed",
      );
    }

    incidentId = body.id;
    chosenHydrantLat = body.nearest[0].hydrant.lat;
    chosenHydrantLng = body.nearest[0].hydrant.lng;
    flaggedOosCount = body.flaggedOos?.length ?? 0;

    // Log for the failing-run summary (.claude-resume.md will capture this).
    console.log(
      `[HF-008 beforeAll] incidentId=${incidentId} ` +
        `chosenHydrant=(${chosenHydrantLat}, ${chosenHydrantLng}) ` +
        `flaggedOosCount=${flaggedOosCount}`,
    );

    if (flaggedOosCount === 0) {
      console.warn(
        "[HF-008 beforeAll] flaggedOosCount=0 — Test 09 (OOS chip) will be skipped. " +
          "The Gorham seed location (43.6791, -70.4444) produced no OOS hydrants in range. " +
          "If OOS coverage is required, use a seed location that reliably produces OOS entries.",
      );
    }

    await ctx.dispose();
  });

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

  test.afterEach(async () => {
    // No /history 404 filter needed here — /map/incident/[id] doesn't navigate
    // elsewhere in the test flow.
    expect(
      consoleErrors,
      `unexpected console errors:\n${consoleErrors.join("\n")}`,
    ).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 01 — Full layout
  // -------------------------------------------------------------------------
  test("renders incident page with map active timer bottom sheet and footer", async ({
    page,
  }) => {
    await page.goto(`/map/incident/${incidentId}`);

    // Wait for Mapbox load event (data-status="ready"). Real tile fetches
    // can take 1-3s on a cold connection — 15s is the project-wide budget.
    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Top bar: pulsing ACTIVE pill
    await expect(page.getByText(/ACTIVE/)).toBeVisible();

    // Top bar: SOS button
    await expect(page.getByRole("button", { name: /sos/i })).toBeVisible();

    // Bottom sheet header
    await expect(page.getByText(/NEAREST HYDRANTS/)).toBeVisible();

    // Footer: NAVIGATE link (red CTA → maps:?daddr=)
    await expect(page.getByRole("link", { name: /navigate/i })).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/hf-008-results/01-full-layout.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 02 — Map ready + marker count
  // -------------------------------------------------------------------------
  test("map reaches ready state with correct marker count", async ({ page }) => {
    await page.goto(`/map/incident/${incidentId}`);

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // At minimum: 1 incident marker + 1 chosen hydrant = 2.
    // In practice: 1 incident + 3 hydrants (chosen + 2 ring) = 4 before OOS.
    const rawCount = await stateEl.getAttribute("data-marker-count");
    const count = parseInt(rawCount ?? "0", 10);
    expect(
      count,
      `expected >= 2 markers (1 incident + ≥1 hydrant), got data-marker-count="${rawCount}"`,
    ).toBeGreaterThanOrEqual(2);

    // Must contain both the incident pin and the chosen (#1) hydrant marker.
    const markerTypes = await stateEl.getAttribute("data-marker-types");
    expect(
      markerTypes,
      `expected data-marker-types to include "incident", got "${markerTypes}"`,
    ).toContain("incident");
    expect(
      markerTypes,
      `expected data-marker-types to include "chosen", got "${markerTypes}"`,
    ).toContain("chosen");

    await page.screenshot({
      path: "tests/screenshots/hf-008-results/02-map-ready.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 03 — Route polyline
  // -------------------------------------------------------------------------
  test("data-hf-map-state reports has-route true", async ({ page }) => {
    await page.goto(`/map/incident/${incidentId}`);

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // NOTE: if Mapbox Directions returns degraded:true (geometry call failed),
    // data-has-route will be "false" even when the incident data is fine.
    // In that case this test fails for a legitimate (rare, transient) reason.
    // Retry once with a fresh run before flagging as a code defect.
    await expect(stateEl).toHaveAttribute("data-has-route", "true");

    await page.screenshot({
      path: "tests/screenshots/hf-008-results/03-route.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 04 — Pill format
  // -------------------------------------------------------------------------
  test("active timer pill matches ACTIVE · MM:SS format", async ({ page }) => {
    await page.goto(`/map/incident/${incidentId}`);

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // The ACTIVE timer pill text must match "ACTIVE · MM:SS".
    // The middle dot (·) may be surrounded by spaces or rendered inline.
    const pill = page.getByText(/ACTIVE/);
    const text = await pill.first().textContent();
    expect(
      text,
      `expected pill text to match /ACTIVE\\s*·\\s*\\d{2}:\\d{2}/, got "${text}"`,
    ).toMatch(/ACTIVE\s*·\s*\d{2}:\d{2}/);

    await page.screenshot({
      path: "tests/screenshots/hf-008-results/04-active-pill.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 05 — Pill ticks
  // -------------------------------------------------------------------------
  test("active timer pill text changes after 1 second", async ({ page }) => {
    await page.goto(`/map/incident/${incidentId}`);

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    const pill = page.getByText(/ACTIVE/).first();

    // Capture T0 text.
    const t0 = await pill.textContent();

    // Wait slightly over one tick interval. waitForTimeout is intentional here:
    // the timer is deterministic (setInterval 1000ms) and we're testing that
    // the DOM updates after at least one tick. Playwright's own docs acknowledge
    // waitForTimeout for deterministic timer tests.
    await page.waitForTimeout(1100);

    // Capture T1 text — must have changed by at least one second.
    const t1 = await pill.textContent();
    expect(
      t1,
      `expected pill text to change after 1.1s, but it stayed "${t0}"`,
    ).not.toBe(t0);

    await page.screenshot({
      path: "tests/screenshots/hf-008-results/05-timer-ticking.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 06 — Bottom sheet header
  // -------------------------------------------------------------------------
  test("bottom sheet header reads NEAREST HYDRANTS · 3 of N", async ({
    page,
  }) => {
    await page.goto(`/map/incident/${incidentId}`);

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Header format: "NEAREST HYDRANTS · 3 of N" where N >= 3.
    // The · separator may be surrounded by spaces.
    await expect(
      page.getByText(/NEAREST HYDRANTS\s*·\s*3 of \d+/),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/hf-008-results/06-sheet-header.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 07 — Three hydrant cards
  // -------------------------------------------------------------------------
  test("three hydrant cards render in rank order with id address distance ETA", async ({
    page,
  }) => {
    await page.goto(`/map/incident/${incidentId}`);

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    for (const rank of [1, 2, 3]) {
      const card = page.locator(`[data-rank="${rank}"]`);
      await expect(
        card,
        `expected [data-rank="${rank}"] to be visible`,
      ).toBeVisible();

      // Hydrant ID in mono — seed IDs like "GOD-HYD00340" or "GODRY030".
      // Pattern covers alphanumeric IDs with optional hyphens.
      const cardText = (await card.textContent()) ?? "";
      expect(
        cardText,
        `[data-rank="${rank}"] should contain a hydrant id matching /[A-Z]+-?[A-Z]*\\d+/`,
      ).toMatch(/[A-Z]+-?[A-Z]*\d+/);

      // Address — at least one non-empty word (any street text)
      expect(
        cardText.trim().length,
        `[data-rank="${rank}"] should have non-empty text content`,
      ).toBeGreaterThan(0);

      // ETA — either "MM:SS" or "N min" / "N sec" / "N s" / "N m" format
      const hasEta =
        /\d+:\d{2}/.test(cardText) || /\d+\s*(min|sec|s|m)\b/i.test(cardText);
      expect(
        hasEta,
        `[data-rank="${rank}"] should contain an ETA (e.g. "2:30" or "2 min"), got: "${cardText}"`,
      ).toBe(true);
    }

    await page.screenshot({
      path: "tests/screenshots/hf-008-results/07-hydrant-cards.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 08 — Card #1 yellow border (structural assertion; visual via screenshot)
  // -------------------------------------------------------------------------
  test("card with data-rank 1 has visible yellow border", async ({ page }) => {
    await page.goto(`/map/incident/${incidentId}`);

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // The yellow border on card #1 is a visual property — we can't assert CSS
    // values without coupling to implementation details. We assert structural
    // presence (element exists, is visible) and rely on the screenshot rubric
    // for visual confirmation against index.html Screen 4.
    const rank1Card = page.locator('[data-rank="1"]');
    await expect(rank1Card).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/hf-008-results/08-rank1-card.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 09 — OOS chip (CONDITIONAL on flaggedOosCount > 0)
  // -------------------------------------------------------------------------
  test("flagged OOS card shows red OUT chip", async ({ page }) => {
    // Skip gracefully if the seed location produced no OOS hydrants.
    // The Gorham (43.6791, -70.4444) location has historically produced OOS
    // entries, but it is not guaranteed. If this test is skipped, the
    // implementer should verify OOS chip logic manually with a known OOS seed.
    test.skip(
      flaggedOosCount === 0,
      `No flagged OOS hydrants for incidentId=${incidentId} at the Gorham seed location. ` +
        "OOS chip path cannot be exercised. Verify manually with a location that produces OOS entries.",
    );

    await page.goto(`/map/incident/${incidentId}`);

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // The OUT chip must be visible...
    const outChip = page.getByText(/OUT/).first();
    await expect(outChip).toBeVisible();

    // ...and must be inside an element marked data-oos="true".
    // The implementer must add data-oos="true" to the OOS card or its wrapper.
    // This attribute is how the spec distinguishes "OUT of service" chips from
    // any other "OUT" text that might appear on the page.
    const oosCard = page.locator('[data-oos="true"]').first();
    await expect(oosCard).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/hf-008-results/09-oos-chip.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 10 — NAVIGATE link
  // -------------------------------------------------------------------------
  test("NAVIGATE link href starts with maps: and contains chosen hydrant coordinates", async ({
    page,
  }) => {
    await page.goto(`/map/incident/${incidentId}`);

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    const nav = page.getByRole("link", { name: /navigate/i });
    await expect(nav).toBeVisible();

    const href = await nav.getAttribute("href");
    expect(
      href,
      `expected href to match /^maps:\\?daddr=/, got "${href}"`,
    ).toMatch(/^maps:\?daddr=/);

    // Check for the chosen hydrant's latitude. We compare at 3-decimal precision
    // to be lenient about rounding (implementation may round to fewer decimals).
    // E.g. lat=43.67914 → prefix "43.679" must be present.
    const latPrefix = chosenHydrantLat.toFixed(3).replace(".", "\\.");
    const lngPrefix = chosenHydrantLng.toFixed(3).replace(".", "\\.");
    expect(
      href,
      `expected href to contain lat prefix ${chosenHydrantLat.toFixed(3)}, got "${href}"`,
    ).toMatch(new RegExp(latPrefix));
    expect(
      href,
      `expected href to contain lng prefix ${chosenHydrantLng.toFixed(3)}, got "${href}"`,
    ).toMatch(new RegExp(lngPrefix));

    await page.screenshot({
      path: "tests/screenshots/hf-008-results/10-navigate-cta.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 11 — Modal open
  // -------------------------------------------------------------------------
  test("tapping list icon opens dialog with full hydrant list", async ({
    page,
  }) => {
    await page.goto(`/map/incident/${incidentId}`);

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // IMPLEMENTER: the list-icon button MUST have an accessible name matching
    // /list|hydrants|expand/i. Suggested: aria-label="Show full hydrant list".
    const listButton = page.getByRole("button", {
      name: /list|hydrants|expand/i,
    });
    await expect(listButton).toBeVisible();
    await listButton.click();

    // The modal must have role="dialog" and become visible.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // The dialog must contain at least one element with data-hydrant-id,
    // confirming the full hydrant list rendered (not just an empty shell).
    // IMPLEMENTER: add data-hydrant-id="<id>" to each hydrant row in the modal.
    const firstHydrantRow = dialog.locator("[data-hydrant-id]").first();
    await expect(firstHydrantRow).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/hf-008-results/11-modal-open.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 12 — Modal close
  // -------------------------------------------------------------------------
  test("modal closes when close button is tapped", async ({ page }) => {
    await page.goto(`/map/incident/${incidentId}`);

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Open the modal (same trigger as test 11).
    const listButton = page.getByRole("button", {
      name: /list|hydrants|expand/i,
    });
    await listButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // IMPLEMENTER: the close button inside the dialog MUST have aria-label="Close"
    // (or accessible text "Close") so this locator resolves.
    // An X icon with no label will cause this test to fail.
    const closeButton = dialog.getByRole("button", { name: /close/i });
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    // Dialog must be gone within 5s of the close tap.
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    await page.screenshot({
      path: "tests/screenshots/hf-008-results/12-modal-closed.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Test 13 — Unauthenticated redirect
  // -------------------------------------------------------------------------
  test("unauthenticated GET /map/incident/:id redirects to /login", async ({
    browser,
  }) => {
    // Fresh context — NOT the `context` from the fixture (which beforeEach
    // calls loginInContext on). Mirror the HF-005 test 08 pattern exactly.
    const fresh = await browser.newContext();
    const page = await fresh.newPage();

    await page.goto(`/map/incident/${incidentId}`);

    // The /map layout gate (requireFirefighter / requireBadge) redirects
    // unauthenticated requests to /login.
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");

    await page.screenshot({
      path: "tests/screenshots/hf-008-results/13-unauthed-redirect.png",
      fullPage: true,
    });

    await fresh.close();
  });
});
