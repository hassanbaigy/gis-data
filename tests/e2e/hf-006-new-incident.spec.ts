import { test, expect } from "@playwright/test";
import { authedRequestContext, loginInContext } from "./helpers/auth";

/**
 * HF-006 — /map/new form + /api/geocode + POST /api/incidents.
 *
 * Drives the full flow end-to-end against real Mapbox (geocode +
 * matrix + directions) and the seeded Gorham DB. ~1-2s per test.
 *
 * Every /map/* page and every Mapbox-touching API route is gated by
 * HF-001's requireFirefighter() / readBadge(). The helpers in
 * tests/e2e/helpers/auth.ts inject the demo badge cookie (0418) so tests
 * don't have to drive the real /login flow.
 */

test.describe("HF-006 new incident", () => {
  test.beforeEach(async ({ context }) => {
    await loginInContext(context);
  });

  test("user fills the form and lands on /map/incident/[id]", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(e.message));

    await page.goto("/map/new");

    // Header + initial state
    await expect(page.getByRole("heading", { name: /NEW INCIDENT/i })).toBeVisible();
    await expect(page.getByText(/STEP\s*1\/2/i)).toBeVisible();
    const submit = page.getByRole("button", { name: /FIND HYDRANTS/i });
    await expect(submit).toBeDisabled();

    // Address autocomplete
    const addressInput = page.getByPlaceholder(/address/i);
    await addressInput.fill("Main St Gorham");

    // Wait for the autocomplete results (debounced 250ms)
    const firstResult = page.locator("[data-geocode-result]").first();
    await firstResult.waitFor({ state: "visible", timeout: 10_000 });

    // Pick the first result
    await firstResult.click();

    // Pick STRUCTURE + alarm 3
    await page.getByRole("button", { name: /STRUCTURE/i }).click();
    await page.getByRole("button", { name: /^3$/, exact: true }).first().click();

    // Submit
    await expect(submit).toBeEnabled();
    await submit.click();

    // We should land on /map/incident/<id>
    await page.waitForURL(/\/map\/incident\/[^/]+$/, { timeout: 15_000 });

    // The placeholder page should show some incident details
    await expect(page.getByText(/incident/i).first()).toBeVisible();

    expect(consoleErrors, `console: ${consoleErrors.join(" · ")}`).toEqual([]);
  });

  test("FIND HYDRANTS stays disabled with no address selected", async ({ page }) => {
    await page.goto("/map/new");
    const submit = page.getByRole("button", { name: /FIND HYDRANTS/i });
    await expect(submit).toBeDisabled();

    // Pick type only — still no address
    await page.getByRole("button", { name: /STRUCTURE/i }).click();
    await expect(submit).toBeDisabled();
  });

  test("alarm defaults to 2 and is selectable 1-5", async ({ page }) => {
    await page.goto("/map/new");
    // The 5-cell row has data-alarm-level on each cell so we can detect
    // which one is selected without coupling to colour classes.
    await expect(page.locator("[data-alarm-level='2'][data-selected='true']"))
      .toBeVisible();
    await page.locator("[data-alarm-level='5']").click();
    await expect(page.locator("[data-alarm-level='5'][data-selected='true']"))
      .toBeVisible();
    await expect(page.locator("[data-alarm-level='2'][data-selected='true']"))
      .toHaveCount(0);
  });
});

test.describe("HF-006 backend wiring", () => {
  test("POST /api/incidents creates a row + returns nearest", async ({
    playwright,
  }) => {
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
    expect(res.ok(), `got ${res.status()} body=${await res.text()}`).toBe(true);
    const body = (await res.json()) as {
      id: string;
      chosenHydrantId: string | null;
      nearest: Array<{ hydrant: { id: string } }>;
    };
    expect(body.id).toMatch(/^c[a-z0-9]{20,}/); // cuid shape
    expect(body.chosenHydrantId).toBe(body.nearest[0].hydrant.id);
    expect(body.nearest.length).toBe(3);

    // GET /api/incidents/[id] returns the same incident
    const getRes = await ctx.get(`/api/incidents/${body.id}`);
    expect(getRes.ok()).toBe(true);
    const getBody = (await getRes.json()) as {
      incident: { id: string; chosenHydrantId: string | null };
    };
    expect(getBody.incident.id).toBe(body.id);

    await ctx.dispose();
  });

  test("POST /api/incidents rejects invalid bodies with 400", async ({
    playwright,
  }) => {
    const ctx = await authedRequestContext(playwright);
    // Missing address
    let res = await ctx.post("/api/incidents", {
      data: { lat: 43.6791, lng: -70.4444, type: "STRUCTURE", alarmLevel: 3 },
    });
    expect(res.status()).toBe(400);

    // Invalid type
    res = await ctx.post("/api/incidents", {
      data: {
        address: "x",
        lat: 43.6791,
        lng: -70.4444,
        type: "WUMBO",
        alarmLevel: 3,
      },
    });
    expect(res.status()).toBe(400);

    // alarmLevel out of range
    res = await ctx.post("/api/incidents", {
      data: {
        address: "x",
        lat: 43.6791,
        lng: -70.4444,
        type: "STRUCTURE",
        alarmLevel: 99,
      },
    });
    expect(res.status()).toBe(400);

    await ctx.dispose();
  });

  test("GET /api/geocode returns up to 5 results", async ({ playwright }) => {
    const ctx = await authedRequestContext(playwright);
    const res = await ctx.get("/api/geocode?q=Main+St+Gorham");
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      results: Array<{ placeName: string; lat: number; lng: number }>;
    };
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.length).toBeLessThanOrEqual(5);
    for (const r of body.results) {
      expect(typeof r.lat).toBe("number");
      expect(typeof r.lng).toBe("number");
    }
    // Token must never appear in the response
    const text = JSON.stringify(body);
    const secretToken = process.env.MAPBOX_SECRET_TOKEN;
    if (secretToken) expect(text).not.toContain(secretToken);
    expect(text).not.toContain("sk.");

    await ctx.dispose();
  });

  test("all gated endpoints return 401 without auth cookie", async ({
    playwright,
  }) => {
    // No cookie this time — a vanilla request context.
    const ctx = await playwright.request.newContext({
      baseURL: process.env.PW_BASE_URL ?? "http://localhost:3000",
    });
    expect(
      (await ctx.post("/api/incidents", { data: {} })).status(),
      "POST /api/incidents should 401",
    ).toBe(401);
    expect(
      (await ctx.get("/api/incidents/anything")).status(),
      "GET /api/incidents/[id] should 401",
    ).toBe(401);
    expect(
      (await ctx.get("/api/geocode?q=Main")).status(),
      "GET /api/geocode should 401",
    ).toBe(401);
    expect(
      (await ctx.post("/api/hydrants/nearest", {
        data: { lat: 43.6791, lng: -70.4444 },
      })).status(),
      "POST /api/hydrants/nearest should 401",
    ).toBe(401);
    await ctx.dispose();
  });

  test("unauthenticated GET /map/new redirects to /login", async ({ browser }) => {
    // Fresh browser context with no cookie injection.
    const fresh = await browser.newContext();
    const page = await fresh.newPage();
    const res = await page.goto("/map/new");
    // Should land on /login after the redirect
    expect(page.url()).toContain("/login");
    expect(res?.ok()).toBe(true);
    await fresh.close();
  });
});
