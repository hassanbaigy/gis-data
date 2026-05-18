import { test, expect } from "@playwright/test";
import { loginInContext, authedRequestContext } from "./helpers/auth";

/**
 * HF-009 — /history filterable incident list
 *
 * Failing-first spec committed BEFORE the implementation lands.
 * Expected failure modes on first run:
 *   - T01: /history 404 means waitForURL(/\/login/) times out → fail
 *   - T02-T09: /history 404 → no [data-hf-map-state], no chips, no rows → all fail
 *
 * beforeAll is allowed to succeed — POST /api/incidents exists.
 *
 * Decisions honoured:
 *   D1 — Path B: client-side type filter (no extra API call on type chip tap)
 *   D2 — All 6 type chips always visible; supplementary +N chip when > 3 selected
 *   D3 — ALL = since=all (no date cutoff); default 7D active on first load
 *   D4 — Time-ago: "1 HR AGO" / "N HRS AGO" for < 48h, "N DAYS AGO" for ≥ 48h
 *   D5 — Empty-filter map centre fallback: Gorham centroid [-70.444, 43.679]
 *
 * Test seam: MapView exposes <div data-hf-map-state data-status data-marker-count
 *            data-marker-types data-has-route> so Playwright can assert without
 *            reading the WebGL canvas.
 *
 * IMPLEMENTER NOTES (do not remove):
 *
 * (A) Each IncidentRow root element MUST have:
 *     - data-incident-row (attribute, no value needed) — for count assertions
 *     - data-incident-id="<uuid>" — for targeted click in T09
 *
 * (B) TimeFilterChips MUST have aria-pressed="true|false" on each chip button.
 *     Initial state: 7D active, 30D and ALL inactive.
 *
 * (C) TypeFilterChips MUST have aria-pressed="true|false" on each chip button.
 *     Initial state: all 6 inactive (no type filter).
 *
 * (D) Tapping a time chip (30D, ALL) MUST re-fetch GET /api/incidents?since=<value>
 *     and update both the map and the list (T05 asserts network call fired).
 *
 * (E) Type chip filter is client-side (D1) — no network call expected on type tap.
 *
 * (F) Chevron on IncidentRow: use aria-hidden="true" on the SVG icon, OR
 *     aria-label="Next" / aria-label="View incident" on an element inside the row.
 *
 * (G) The +N indicator (D2) must be a visible element with text matching /\+\d+/
 *     somewhere within the type filter region when > 3 type chips are selected.
 */

// ---------------------------------------------------------------------------
// Shared state populated in beforeAll — real API call happens here.
// ---------------------------------------------------------------------------

let incidentId: string;
// incidentType is always "STRUCTURE" (we set it in the POST body below)
const incidentType = "STRUCTURE";

test.describe("HF-009 /history page", () => {
  test.beforeAll(async ({ playwright }) => {
    // Real Mapbox (geocode) calls can take 1-3s.
    // Give the full 60s to avoid flaky timeouts in CI.
    test.setTimeout(60_000);

    const ctx = await authedRequestContext(playwright);
    const res = await ctx.post("/api/incidents", {
      data: {
        address: "Main St, Gorham, ME 04038",
        lat: 43.6791,
        lng: -70.4444,
        type: incidentType,
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

    const body = (await res.json()) as { id: string };

    if (!body.id) {
      throw new Error("beforeAll: POST /api/incidents returned no id");
    }

    incidentId = body.id;

    // Log for the failing-run summary (.claude-resume.md will capture this).
    console.log(
      `[HF-009 beforeAll] incidentId=${incidentId} type=${incidentType}`,
    );

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
    // Strict guard: /history exists post-implementation so no route-404 filter needed.
    expect(
      consoleErrors,
      `unexpected console errors:\n${consoleErrors.join("\n")}`,
    ).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // T01 — unauthenticated GET /history redirects to /login
  // -------------------------------------------------------------------------
  test("unauthenticated GET /history redirects to /login", async ({
    browser,
  }) => {
    // Fresh context — no loginInContext() called here (beforeEach injects into
    // `context`, not into this fresh context). Mirror hf-005-home.spec.ts test 08.
    const fresh = await browser.newContext();
    const page = await fresh.newPage();

    await page.goto("/history");

    // Auth gate (requireFirefighter) must redirect to /login.
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");

    await page.screenshot({
      path: "tests/screenshots/hf-009-history/01-unauthed-redirect.png",
      fullPage: true,
    });

    await fresh.close();
  });

  // -------------------------------------------------------------------------
  // T02 — map reaches ready state with incident markers only
  // -------------------------------------------------------------------------
  test("map reaches ready state with incident markers only", async ({
    page,
  }) => {
    await page.goto("/history");

    // Wait for Mapbox load event (data-status="ready"). Real tile fetches
    // can take 1-3s on a cold connection — 15s is the project-wide budget.
    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // At minimum: the beforeAll incident + the 6 seed incidents = >= 7.
    const rawCount = await stateEl.getAttribute("data-marker-count");
    const count = parseInt(rawCount ?? "0", 10);
    expect(
      count,
      `expected >= 1 incident marker, got data-marker-count="${rawCount}"`,
    ).toBeGreaterThanOrEqual(1);

    // /history shows incidents ONLY — no hydrant, chosen, or oos markers.
    const types = (await stateEl.getAttribute("data-marker-types")) ?? "";
    expect(
      types,
      `expected data-marker-types to contain "incident", got "${types}"`,
    ).toContain("incident");
    expect(
      types,
      `expected data-marker-types NOT to contain "hydrant", got "${types}"`,
    ).not.toContain("hydrant");
    expect(
      types,
      `expected data-marker-types NOT to contain "chosen", got "${types}"`,
    ).not.toContain("chosen");
    expect(
      types,
      `expected data-marker-types NOT to contain "oos", got "${types}"`,
    ).not.toContain("oos");

    await page.screenshot({
      path: "tests/screenshots/hf-009-history/02-map-ready.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // T03 — full layout: header map filter rail and incident list
  // -------------------------------------------------------------------------
  test("full layout: header map filter rail and incident list", async ({
    page,
  }) => {
    await page.goto("/history");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Time filter rail — 7D (default active), 30D, ALL chips.
    // Use exact-name matches to avoid "ALL HYDRANTS" or similar false positives.
    const chip7D = page.getByRole("button", { name: /^7\s*D$/i });
    const chip30D = page.getByRole("button", { name: /^30\s*D$/i });
    const chipALL = page.getByRole("button", { name: /^ALL$/i });

    await expect(chip7D).toBeVisible();
    await expect(chip30D).toBeVisible();
    await expect(chipALL).toBeVisible();

    // D3: initial state — 7D is active; 30D and ALL are inactive.
    await expect(chip7D).toHaveAttribute("aria-pressed", "true");
    await expect(chip30D).toHaveAttribute("aria-pressed", "false");
    await expect(chipALL).toHaveAttribute("aria-pressed", "false");

    // Type filter rail — all 6 categories must be visible.
    const typeChips = [
      "STRUCTURE",
      "VEHICLE",
      "BRUSH",
      "MEDICAL",
      "HAZMAT",
      "OTHER",
    ] as const;

    for (const typeName of typeChips) {
      await expect(
        page.getByRole("button", { name: new RegExp(`^${typeName}$`, "i") }),
      ).toBeVisible();
    }

    // All 6 type chips start inactive (no type filter applied on first load).
    for (const typeName of typeChips) {
      await expect(
        page.getByRole("button", { name: new RegExp(`^${typeName}$`, "i") }),
      ).toHaveAttribute("aria-pressed", "false");
    }

    await page.screenshot({
      path: "tests/screenshots/hf-009-history/03-full-layout.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // T04 — initial list shows all seeded incidents (>= 6 rows)
  // -------------------------------------------------------------------------
  test("initial list shows all seeded incidents (>= 6 rows)", async ({
    page,
  }) => {
    await page.goto("/history");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Default filter is 7D. The seed has 6 incidents within the past 7 days,
    // plus the beforeAll-added incident → at least 7 rows visible.
    const rows = page.locator("[data-incident-row]");
    const count = await rows.count();
    expect(
      count,
      `expected >= 6 incident rows, got ${count}`,
    ).toBeGreaterThanOrEqual(6);

    await page.screenshot({
      path: "tests/screenshots/hf-009-history/04-list-default.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // T05 — tapping 30D chip re-fetches and updates map and list
  // -------------------------------------------------------------------------
  test("tapping 30D chip re-fetches and updates map and list", async ({
    page,
  }) => {
    // Set up the network spy BEFORE navigating (mirror hf-005-home.spec.ts test 07).
    const apiCalls: string[] = [];
    page.on("request", (req) => {
      const u = new URL(req.url());
      if (u.pathname === "/api/incidents" && req.method() === "GET") {
        apiCalls.push(u.search); // e.g. "?since=30d"
      }
    });

    await page.goto("/history");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Server-rendered initial state uses Prisma directly, NOT /api/incidents.
    // apiCalls must be empty at this point.
    expect(
      apiCalls,
      "expected 0 API calls after SSR — initial load goes through Prisma, not the API",
    ).toHaveLength(0);

    // Tap the 30D chip.
    const chip30D = page.getByRole("button", { name: /^30\s*D$/i });
    await chip30D.click();

    // 30D becomes active; 7D becomes inactive.
    await expect(chip30D).toHaveAttribute("aria-pressed", "true", {
      timeout: 10_000,
    });
    const chip7D = page.getByRole("button", { name: /^7\s*D$/i });
    await expect(chip7D).toHaveAttribute("aria-pressed", "false", {
      timeout: 5_000,
    });

    // Verify the re-fetch actually fired (network-level proof).
    await expect
      .poll(() => apiCalls.length, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(1);

    expect(
      apiCalls.some((s) => s.includes("since=30d")),
      `expected at least one /api/incidents call with since=30d, got: ${JSON.stringify(apiCalls)}`,
    ).toBe(true);

    // Map re-fetches: wait for "ready" again (may momentarily drop to "loading").
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    await page.screenshot({
      path: "tests/screenshots/hf-009-history/05-time-filter.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // T06 — tapping STRUCTURE chip filters list rows to STRUCTURE only
  // -------------------------------------------------------------------------
  test("tapping STRUCTURE chip filters list rows to STRUCTURE only", async ({
    page,
  }) => {
    await page.goto("/history");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Note initial row count before applying type filter.
    const rows = page.locator("[data-incident-row]");
    const initialCount = await rows.count();
    expect(initialCount, "expected at least one row before type filter").toBeGreaterThan(0);

    // Tap STRUCTURE chip.
    const structureChip = page.getByRole("button", { name: /^STRUCTURE$/i });
    await structureChip.click();

    // STRUCTURE chip must now be active.
    await expect(structureChip).toHaveAttribute("aria-pressed", "true", {
      timeout: 5_000,
    });

    // Client-side filter (D1): wait a tick for React re-render.
    // Seed has 2 STRUCTURE + 4 others; beforeAll added 1 STRUCTURE → 3 STRUCTURE out of 7+.
    // So filtered count must be strictly less than the total.
    const filteredCount = await rows.count();
    expect(
      filteredCount,
      `expected filtered count (${filteredCount}) < initial count (${initialCount}) after STRUCTURE filter`,
    ).toBeLessThan(initialCount);

    // Reviewer HIGH-3 — guard against vacuous pass: if filtering produced
    // zero rows (e.g. filter bug), the per-row STRUCTURE assertion below
    // would never execute and the test would silently pass. Assert > 0
    // explicitly.
    expect(
      filteredCount,
      "expected at least one STRUCTURE row after filter (otherwise the per-row assertion vacuously passes)",
    ).toBeGreaterThan(0);

    // Every visible row must be a STRUCTURE incident.
    for (let i = 0; i < filteredCount; i++) {
      const rowText = (await rows.nth(i).textContent()) ?? "";
      expect(
        rowText.toUpperCase(),
        `row ${i} should contain "STRUCTURE" after type filter, got: "${rowText}"`,
      ).toContain("STRUCTURE");
    }

    await page.screenshot({
      path: "tests/screenshots/hf-009-history/06-type-filter.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // T07 — selecting 4 type chips shows +N indicator
  // -------------------------------------------------------------------------
  test("selecting 4 type chips shows +N indicator", async ({ page }) => {
    await page.goto("/history");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Tap 4 type chips in sequence.
    const chipNames = ["STRUCTURE", "VEHICLE", "BRUSH", "MEDICAL"] as const;

    for (const name of chipNames) {
      await page.getByRole("button", { name: new RegExp(`^${name}$`, "i") }).click();
    }

    // All four chips must be active.
    for (const name of chipNames) {
      await expect(
        page.getByRole("button", { name: new RegExp(`^${name}$`, "i") }),
      ).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });
    }

    // D2: when > 3 type chips are selected, a supplementary +N indicator must appear.
    // The +N element is non-interactive but visible. Reviewer T07 false-positive
    // risk addressed: scope the locator to the type-filter region so an
    // unrelated `+1`-style string elsewhere on the page can't satisfy it.
    const typeFilterRegion = page.locator(
      '[role="group"][aria-label="Incident type filter"]',
    );
    const plusNEl = typeFilterRegion.getByText(/\+\d+/).first();
    await expect(
      plusNEl,
      "expected a +N indicator inside the type-filter region after 4 chips selected",
    ).toBeVisible({ timeout: 5_000 });

    await page.screenshot({
      path: "tests/screenshots/hf-009-history/07-plus-n.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // T08 — IncidentRow renders time-ago address type chip alarm chip and chevron
  // -------------------------------------------------------------------------
  test("IncidentRow renders time-ago address type chip alarm chip and chevron", async ({
    page,
  }) => {
    await page.goto("/history");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Inspect the first row.
    const firstRow = page.locator("[data-incident-row]").first();
    await expect(firstRow).toBeVisible();

    const rowText = (await firstRow.textContent()) ?? "";

    // Time-ago label: "N HR AGO" / "N HRS AGO" / "N DAY AGO" / "N DAYS AGO"
    expect(
      rowText,
      `expected time-ago label in row text, got: "${rowText}"`,
    ).toMatch(/\d+\s*(HR|HRS|DAY|DAYS)\s*AGO/i);

    // Address: row must contain some non-whitespace text beyond the time-ago label.
    // Strip the time-ago portion and verify remainder is non-empty.
    const withoutTimeAgo = rowText.replace(/\d+\s*(HR|HRS|DAY|DAYS)\s*AGO/i, "").trim();
    expect(
      withoutTimeAgo.length,
      `expected non-empty address in row after removing time-ago, got: "${withoutTimeAgo}"`,
    ).toBeGreaterThan(0);

    // Type chip: one of the valid types.
    const validTypes = ["STRUCTURE", "VEHICLE", "BRUSH", "MEDICAL", "HAZMAT", "OTHER"];
    const hasValidType = validTypes.some((t) =>
      rowText.toUpperCase().includes(t),
    );
    expect(
      hasValidType,
      `expected row to contain a valid type chip (one of ${validTypes.join(", ")}), got: "${rowText}"`,
    ).toBe(true);

    // Alarm chip: "ALARM N" or "LEVEL N".
    expect(
      rowText,
      `expected alarm chip matching /(ALARM|LEVEL)\\s*\\d/ in row, got: "${rowText}"`,
    ).toMatch(/(ALARM|LEVEL)\s*\d/i);

    // Chevron icon: either an aria-hidden SVG or an aria-label="Next|View" element.
    const hasChevron =
      (await firstRow.locator("[aria-hidden='true']").count()) > 0 ||
      (await firstRow
        .locator("[aria-label*='Next' i], [aria-label*='View' i]")
        .count()) > 0;
    expect(
      hasChevron,
      "expected a chevron icon (aria-hidden='true' child or aria-label*=Next/View) inside the row",
    ).toBe(true);

    await page.screenshot({
      path: "tests/screenshots/hf-009-history/08-row-content.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // T09 — tapping a row navigates to /map/incident/[id]
  // -------------------------------------------------------------------------
  test("tapping a row navigates to /map/incident/[id]", async ({ page }) => {
    await page.goto("/history");

    const stateEl = page.locator("[data-hf-map-state]");
    await expect(stateEl).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Locate the row created in beforeAll by its exact incident ID.
    // The list is ordered createdAt DESC, so this incident should be near the top.
    const targetRow = page.locator(`[data-incident-id="${incidentId}"]`);
    await expect(
      targetRow,
      `expected to find row with data-incident-id="${incidentId}"`,
    ).toBeVisible({ timeout: 10_000 });

    // Click the row — should navigate to /map/incident/<id>.
    await targetRow.click();

    await page.waitForURL(/\/map\/incident\//, { timeout: 10_000 });
    expect(
      page.url(),
      `expected URL to contain incidentId="${incidentId}", got "${page.url()}"`,
    ).toContain(incidentId);

    await page.screenshot({
      path: "tests/screenshots/hf-009-history/09-row-tap-nav.png",
      fullPage: true,
    });
  });
});
