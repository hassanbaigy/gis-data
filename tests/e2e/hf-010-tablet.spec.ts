import { test, expect } from "@playwright/test";
import { loginInContext, authedRequestContext } from "./helpers/auth";

/**
 * HF-010 — Tablet breakpoint pass
 *
 * Failing-first spec. Expected state when committed:
 *   T01 FAIL — no [data-hf-rail] element exists; rail layout not implemented yet.
 *   T02 FAIL — BottomSheet width ≈ 440px at x=0 not satisfied; current code renders
 *              it as a full-width bottom overlay at any viewport.
 *   T03 FAIL — section[aria-label="Incident history"] width ≈ 440px not satisfied;
 *              current code renders the list as a half-height column strip.
 *   T04 PASS (coincidentally) — phone layout IS the current layout at 390×844;
 *              no rail exists so count === 0, map is full-width, hint card visible,
 *              footer CTA visible. This is the regression guard — it must remain
 *              green after HF-010 ships.
 *   T05 PASS/FAIL — badge plate top-left (x ≤ 24) may pass since the overlay is
 *              already absolutely positioned; SOS right-edge ≥ 1000 may fail if
 *              1280px default viewport shifts the SOS position before Step B.
 *              With Step B (viewport → 390) not yet applied, this spec forces
 *              1024×768 via test.use, so it is deterministic regardless of config.
 *   T06 PASS (coincidentally) — markers render at any viewport.
 *   T07 PASS (coincidentally) — link and row navigation work at any viewport.
 *
 * Test-seam contract for the implementer (Steps C/D/E):
 *   - Rail container on /map (aside or section) MUST carry data-hf-rail="map".
 *   - BottomSheet on /map/incident/[id] MUST become a static left rail with
 *     aria-label="Nearest hydrants results" (already present; just re-positioned).
 *   - section[aria-label="Incident history"] on /history stays (already present).
 *   - [data-incident-row] stays (HF-009 pattern preserved).
 *
 * Viewport strategy:
 *   - tablet describe block: test.use({ viewport: { width: 1024, height: 768 } })
 *   - phone describe block:  test.use({ viewport: { width: 390, height: 844 } })
 *   These override playwright.config.ts (currently Desktop Chrome 1280×720; Step B
 *   will change it to 390×844 phone-default). Both describe blocks are deterministic
 *   regardless of the config state.
 */

// ---------------------------------------------------------------------------
// beforeAll — seed one incident for T02/T06/T07 navigation
// ---------------------------------------------------------------------------

let incidentId: string;

// NOTE: beforeAll runs once for the whole file. Playwright scopes it to the
// first describe block it appears in, but because we declare it at the top
// level it runs before either describe block. Both describe blocks share it.
// We use the module-level `test.beforeAll` pattern from HF-008.

// ---------------------------------------------------------------------------
// Tablet viewport block — T01, T02, T03, T05, T06, T07
// ---------------------------------------------------------------------------

test.describe("HF-010 tablet viewport (1024x768)", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test.beforeAll(async ({ playwright }) => {
    // Real Mapbox calls (geocode + matrix + directions) can take 1–3s.
    // Budget 60s to keep beforeAll from timing out in CI.
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
        `[HF-010 beforeAll] POST /api/incidents failed — ${res.status()} ${body}. ` +
          "Check that .env.local has MAPBOX_SECRET_TOKEN and NEXT_PUBLIC_MAPBOX_TOKEN.",
      );
    }

    const body = (await res.json()) as { id: string };

    if (!body.id) {
      throw new Error("[HF-010 beforeAll] POST /api/incidents returned no id");
    }

    incidentId = body.id;

    console.log(`[HF-010 beforeAll] incidentId=${incidentId}`);

    await ctx.dispose();
  });

  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page, context }) => {
    consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await loginInContext(context);
  });

  test.afterEach(async ({ page }) => {
    // Filter the well-known resource-not-found messages that appear when
    // navigating to /map or /history during the failing-first phase
    // (before Steps C/D/E ship). Unrelated errors still fail the test.
    const url = page.url();
    const filtered = consoleErrors.filter((msg) => {
      if (
        (url.includes("/map") || url.includes("/history")) &&
        msg.includes("Failed to load resource") &&
        msg.includes("404")
      ) {
        return false;
      }
      return true;
    });
    expect(
      filtered,
      `unexpected console errors on ${url}:\n${filtered.join("\n")}`,
    ).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // T01 — /map shows a 440px-wide dispatch rail and remaining-width map
  //
  // WILL FAIL until Step C ships (map-home.tsx lg:flex-row + data-hf-rail).
  // The rail container does not exist in the current codebase. When Step C
  // ships, the implementer MUST add data-hf-rail="map" to the rail <aside>.
  // -------------------------------------------------------------------------
  test("/map shows 440px rail and remaining-width map at tablet viewport", async ({
    page,
  }) => {
    await page.goto("/map");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // The dispatch rail — exists only after Step C ships.
    // IMPLEMENTER: add data-hf-rail="map" to the rail <aside> element.
    const rail = page.locator("[data-hf-rail]");

    // Assert the rail is present. This assertion drives the failing-first run.
    await expect(
      rail,
      "expected [data-hf-rail] to be present on /map at 1024×768 — rail not yet implemented (Step C)",
    ).toBeVisible({ timeout: 5_000 });

    const railBox = await rail.boundingBox();
    expect(
      railBox,
      "expected rail to have a layout box (visible in DOM)",
    ).not.toBeNull();

    // Width ≈ 440px, ±8px tolerance (AC: "440px left rail")
    expect(
      railBox!.width,
      `expected rail width ≈ 440px, got ${railBox!.width}`,
    ).toBeGreaterThanOrEqual(432);
    expect(
      railBox!.width,
      `expected rail width ≈ 440px, got ${railBox!.width}`,
    ).toBeLessThanOrEqual(448);

    // Rail must be at x ≈ 0 (left edge of viewport)
    expect(
      railBox!.x,
      `expected rail x ≈ 0 (left edge), got ${railBox!.x}`,
    ).toBeLessThanOrEqual(4);

    // Map section must start at x ≈ 440 (immediately after the rail).
    // The map container inherits from [data-hf-map-state]'s parent section.
    // IMPLEMENTER: the map section must carry data-hf-map-section="map" OR
    // the locator below must be updated to match the actual element.
    // We locate via the map-state div's parent that is a sibling of the rail.
    const mapSection = page.locator("[data-hf-map-state]").locator("xpath=ancestor::*[1]");
    const mapBox = await mapSection.boundingBox();

    if (mapBox !== null) {
      // Allow ±8px slop on the x position (Chromium scrollbar offset).
      expect(
        mapBox.x,
        `expected map section x ≈ 440 (after rail), got ${mapBox.x}`,
      ).toBeGreaterThanOrEqual(432);
    }

    await page.screenshot({
      path: "tests/screenshots/hf-010-tablet/T01-map-tablet.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // T02 — /map/incident/[id] shows BottomSheet as a 440px rail
  //
  // WILL FAIL until Step D ships (incident-view.tsx lg:flex-row rail class).
  // The BottomSheet currently renders as a full-width bottom overlay.
  // -------------------------------------------------------------------------
  test("/map/incident/[id] shows BottomSheet as 440px rail at tablet viewport", async ({
    page,
  }) => {
    await page.goto(`/map/incident/${incidentId}`);

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // The BottomSheet renders a <section aria-label="Nearest hydrants results">
    // per BottomSheet.tsx (confirmed by reading incident-view.tsx line 202).
    const sheet = page.locator('section[aria-label="Nearest hydrants results"]');

    await expect(
      sheet,
      'expected section[aria-label="Nearest hydrants results"] to be visible',
    ).toBeVisible({ timeout: 5_000 });

    const sheetBox = await sheet.boundingBox();
    expect(
      sheetBox,
      "expected BottomSheet to have a layout box",
    ).not.toBeNull();

    // Width ≈ 440px (±8px) — fails pre-Step-D (currently full-viewport width)
    expect(
      sheetBox!.width,
      `expected BottomSheet width ≈ 440px at tablet viewport, got ${sheetBox!.width}`,
    ).toBeGreaterThanOrEqual(432);
    expect(
      sheetBox!.width,
      `expected BottomSheet width ≈ 440px at tablet viewport, got ${sheetBox!.width}`,
    ).toBeLessThanOrEqual(448);

    // x ≈ 0 — rail must be at the left edge
    expect(
      sheetBox!.x,
      `expected BottomSheet x ≈ 0 (left rail), got ${sheetBox!.x}`,
    ).toBeLessThanOrEqual(4);

    await page.screenshot({
      path: "tests/screenshots/hf-010-tablet/T02-incident-tablet.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // T03 — /history shows list section as a 440px rail
  //
  // WILL FAIL until Step E ships (history-view.tsx lg:flex-row + lg:w-[440px]).
  // Currently section[aria-label="Incident history"] is full-width bottom half.
  // -------------------------------------------------------------------------
  test("/history shows list section as 440px rail at tablet viewport", async ({
    page,
  }) => {
    await page.goto("/history");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // section[aria-label="Incident history"] confirmed in history-view.tsx line 153.
    const listSection = page.locator('section[aria-label="Incident history"]');

    await expect(
      listSection,
      'expected section[aria-label="Incident history"] to be visible',
    ).toBeVisible({ timeout: 5_000 });

    const listBox = await listSection.boundingBox();
    expect(
      listBox,
      "expected list section to have a layout box",
    ).not.toBeNull();

    // Width ≈ 440px (±8px) — fails pre-Step-E
    expect(
      listBox!.width,
      `expected list section width ≈ 440px at tablet viewport, got ${listBox!.width}`,
    ).toBeGreaterThanOrEqual(432);
    expect(
      listBox!.width,
      `expected list section width ≈ 440px at tablet viewport, got ${listBox!.width}`,
    ).toBeLessThanOrEqual(448);

    // x ≈ 0 — list must be the left rail, not the right column
    expect(
      listBox!.x,
      `expected list section x ≈ 0 (left rail), got ${listBox!.x}`,
    ).toBeLessThanOrEqual(4);

    await page.screenshot({
      path: "tests/screenshots/hf-010-tablet/T03-history-tablet.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // T05 — top bar elements stay in the same absolute corners at 1024×768
  //
  // Badge plate must be ≤ 24px from the left edge.
  // SOS button right edge must be ≥ 1000px (≤ 24px from the 1024px right edge).
  // May pass coincidentally — top bar is already absolute-positioned.
  // -------------------------------------------------------------------------
  test("top bar elements stay in same absolute corners at tablet viewport", async ({
    page,
  }) => {
    await page.goto("/map");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Badge plate — confirmed by HF-005 pattern and map-home.tsx (BadgePlate badge={badge})
    const badgePlate = page.getByText(/badge\s*0418/i);
    await expect(badgePlate).toBeVisible();

    const badgeBox = await badgePlate.boundingBox();
    expect(
      badgeBox,
      "expected badge plate to have a layout box",
    ).not.toBeNull();

    // Left inset ≤ 24px (16px design inset + 8px scrollbar/padding slop).
    expect(
      badgeBox!.x,
      `expected badge plate x ≤ 24px (left inset), got ${badgeBox!.x}`,
    ).toBeLessThanOrEqual(24);

    // SOS button — confirmed by map-home.tsx (SosButton with aria-label via D2)
    const sosBtn = page.getByRole("button", { name: /sos/i });
    await expect(sosBtn).toBeVisible();

    const sosBox = await sosBtn.boundingBox();
    expect(
      sosBox,
      "expected SOS button to have a layout box",
    ).not.toBeNull();

    // Right edge ≥ 1000px at 1024-wide viewport (16px inset + 8px slop from right = 1000).
    const sosRightEdge = sosBox!.x + sosBox!.width;
    expect(
      sosRightEdge,
      `expected SOS right edge ≥ 1000px, got ${sosRightEdge}`,
    ).toBeGreaterThanOrEqual(1000);

    await page.screenshot({
      path: "tests/screenshots/hf-010-tablet/T05-top-corners-tablet.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // T06 — map markers render correctly at tablet viewport
  //
  // Confirms the AD2 Mapbox container-sizing fix (minWidth: 0 at consumer
  // level) works when the map is in a row-flex container.
  // May pass coincidentally — markers render at the current (phone) layout too.
  // -------------------------------------------------------------------------
  test("map markers render correctly at tablet viewport", async ({ page }) => {
    // Sub-assertion 1: /map shows >= 6 incident markers (seeded data)
    await page.goto("/map");

    let stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    const rawCountMap = await stateEl.getAttribute("data-marker-count");
    const countMap = parseInt(rawCountMap ?? "0", 10);
    expect(
      countMap,
      `expected >= 6 incident markers on /map, got data-marker-count="${rawCountMap}"`,
    ).toBeGreaterThanOrEqual(6);

    await page.screenshot({
      path: "tests/screenshots/hf-010-tablet/T06-markers-tablet.png",
      fullPage: true,
    });

    // Sub-assertion 2: /map/incident/[id] shows >= 2 markers (incident + chosen hydrant)
    await page.goto(`/map/incident/${incidentId}`);

    stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    const rawCountIncident = await stateEl.getAttribute("data-marker-count");
    const countIncident = parseInt(rawCountIncident ?? "0", 10);
    expect(
      countIncident,
      `expected >= 2 markers on /map/incident/${incidentId} (1 incident + ≥1 hydrant), got "${rawCountIncident}"`,
    ).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // T07 — existing flows work at tablet viewport (combined: T07a + T07b)
  //
  // T07a: /map → tap "+ New Incident" → URL becomes /map/new.
  // T07b: /history → tap first incident row → URL matches /map/incident/...
  // May pass coincidentally — flows don't depend on the rail layout.
  // -------------------------------------------------------------------------
  test("existing flows work at tablet viewport", async ({ page }) => {
    // ----- T07a: tap + New Incident on /map --------------------------------
    await page.goto("/map");

    const stateElMap = page.locator("[data-hf-map-state]");
    await expect(stateElMap).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // map-home.tsx line 189: <Link href="/map/new">+ New Incident</Link>
    const newIncidentCta = page.getByRole("link", { name: /new\s*incident/i });
    await expect(newIncidentCta).toBeVisible();
    await newIncidentCta.click();

    await page.waitForURL(/\/map\/new$/, { timeout: 10_000 });
    expect(page.url()).toContain("/map/new");

    // ----- T07b: tap first row on /history → navigates to /map/incident/... -
    await page.goto("/history");

    const stateElHistory = page.locator("[data-hf-map-state]");
    await expect(stateElHistory).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // The beforeAll incident should be near the top of the list (ordered DESC).
    // We look for the specific row created in beforeAll by its incident id.
    // If that row isn't visible (e.g. 7D filter doesn't include it), fall back
    // to the first available row — T07b only checks navigation, not which
    // specific incident is opened.
    const targetRow = page.locator(`[data-incident-id="${incidentId}"]`);
    const targetCount = await targetRow.count();

    let clickTarget;
    if (targetCount > 0) {
      clickTarget = targetRow.first();
    } else {
      // Fallback: click the first available incident row.
      clickTarget = page.locator("[data-incident-row]").first();
    }

    await expect(
      clickTarget,
      "expected at least one incident row to be visible on /history",
    ).toBeVisible({ timeout: 10_000 });

    await clickTarget.click();

    await page.waitForURL(/\/map\/incident\//, { timeout: 10_000 });
    expect(
      page.url(),
      `expected URL to match /map/incident/<id> after row tap, got "${page.url()}"`,
    ).toMatch(/\/map\/incident\//);

    await page.screenshot({
      path: "tests/screenshots/hf-010-tablet/T07-flows-tablet.png",
      fullPage: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Phone-baseline block — T04 only
// ---------------------------------------------------------------------------

test.describe("HF-010 phone-baseline (390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page, context }) => {
    consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await loginInContext(context);
  });

  test.afterEach(async ({ page }) => {
    const url = page.url();
    const filtered = consoleErrors.filter((msg) => {
      if (
        (url.includes("/map") || url.includes("/history")) &&
        msg.includes("Failed to load resource") &&
        msg.includes("404")
      ) {
        return false;
      }
      return true;
    });
    expect(
      filtered,
      `unexpected console errors on ${url}:\n${filtered.join("\n")}`,
    ).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // T04 — /map renders phone layout unchanged at 390×844
  //
  // This is the regression guard. After HF-010 ships, the phone layout
  // (< 900px wide) must be byte-identical to before. T04 asserts the
  // structural properties of the phone layout — no rail, full-width map,
  // hint card visible, footer CTA visible.
  //
  // Expected to PASS coincidentally on the failing-first run because the
  // current codebase only has the phone layout (no breakpoints yet).
  // -------------------------------------------------------------------------
  test("/map renders phone layout at 390x844 viewport", async ({ page }) => {
    await page.goto("/map");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // No rail should be VISIBLE at phone viewport. Two equally-valid impl
    // paths satisfy "phone byte-identity":
    //   (a) conditionally-rendered rail (DOM element absent at phone)
    //   (b) CSS-hidden rail via `hidden lg:flex` (DOM present, display:none)
    // (b) is simpler (no useMediaQuery, no SSR hydration flash) and
    // semantically equivalent — the user sees no rail either way.
    // Assertion accepts both: if no rail in DOM, the count check passes; if
    // rail exists in DOM, assert it's hidden.
    //
    // T04 adjustment made during Step C (HF-010) — original spec asserted
    // count === 0 which forced conditional rendering. Relaxed to "not
    // visible" so CSS-`hidden` path is also valid. Documented in the
    // Step C commit body.
    const railLocator = page.locator("[data-hf-rail]");
    const railCount = await railLocator.count();
    if (railCount > 0) {
      await expect(
        railLocator,
        "rail element exists in DOM at phone viewport but must be hidden",
      ).toBeHidden();
    }

    // Map must occupy near-full viewport width at phone.
    // The map area is the flex-1 div inside <main> — its parent section or div
    // should span the full 390px width. We locate via data-hf-map-state's
    // parent (the wrapping div with className="relative flex-1").
    // Allow ±20px for browser chrome (scroll bar, viewport rounding).
    const mapWrapper = page.locator("[data-hf-map-state]").locator("xpath=ancestor::div[1]");
    const mapBox = await mapWrapper.boundingBox();

    if (mapBox !== null) {
      expect(
        mapBox.width,
        `expected map wrapper to span ≈ 390px (full phone viewport), got ${mapBox.width}`,
      ).toBeGreaterThanOrEqual(370);
      expect(
        mapBox.width,
        `expected map wrapper width ≤ 410px at phone viewport, got ${mapBox.width}`,
      ).toBeLessThanOrEqual(410);
    }

    // Hint card — "LAST INCIDENT" label must be visible on the phone layout.
    // HF-010 Step C uses CSS-`hidden` for the tablet rail, so the rail's
    // HintCard is in DOM (display:none) AT phone viewport too. Playwright's
    // strict-mode `.toBeVisible()` fails on ambiguous locators that match
    // both DOM elements; `.first()` would pick the DOM-first element which
    // may be the hidden one. `.filter({ visible: true })` is the right
    // tool — keeps exactly the visible match (one at each viewport).
    // T04 adjustment made during Step C — documented in the commit body.
    await expect(
      page.getByText(/last\s*incident/i).filter({ visible: true }),
      'expected "LAST INCIDENT" hint card to be visible at phone viewport',
    ).toBeVisible();

    // Footer CTA — "+ New Incident" link must be visible. Same visible-
    // filter rationale: rail footer + phone footer both render the link.
    await expect(
      page.getByRole("link", { name: /new\s*incident/i }).filter({ visible: true }),
      'expected "+ New Incident" footer CTA to be visible at phone viewport',
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/hf-010-tablet/T04-phone-baseline.png",
      fullPage: true,
    });
  });
});
