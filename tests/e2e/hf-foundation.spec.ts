import { test, expect } from "@playwright/test";

/**
 * HF-Foundation spec — verifies the seed shipped:
 *  - 456 hydrants from the Gorham CSV, ≥95% geocoded successfully
 *  - 1 firefighter (badge 0418)
 *  - 6 incidents, all linked to badge 0418, covering ≥4 distinct types
 *
 * Hits /api/health/db. Drives the spec via Playwright's APIRequestContext —
 * no browser needed for this story since it's data-layer-only.
 */

test.describe("HF-Foundation data layer", () => {
  test("seed populated firefighter / hydrants / incidents", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.PW_BASE_URL ?? "http://localhost:3000",
    });
    const res = await ctx.get("/api/health/db");
    expect(res.ok(), `expected 200 from /api/health/db, got ${res.status()}`).toBe(true);

    const body = (await res.json()) as {
      firefighterCount: number;
      hydrantCount: number;
      hydrantGeocodedCount: number;
      incidentCount: number;
      incidentsByType: Record<string, number>;
      incidentOwnerBadges: string[];
    };

    // Hydrants — full set from the CSV (456 rows). The enrichment script
    // dedupes by id; the cleanup pass nulls out-of-bounds outliers (~2),
    // so we tolerate hydrantCount from 450 to 456 inclusive.
    expect(body.hydrantCount).toBeGreaterThanOrEqual(450);
    expect(body.hydrantCount).toBeLessThanOrEqual(456);

    // Geocoding — at least 95% of hydrants must have lat + lng. The
    // committed snapshot currently sits at 99.6% (454 of 456); the
    // 2-row buffer protects against an honest re-enrichment that nulls
    // out a few low-confidence rows.
    const geocodedShare = body.hydrantGeocodedCount / body.hydrantCount;
    expect(
      geocodedShare,
      `only ${(geocodedShare * 100).toFixed(1)}% of hydrants geocoded`,
    ).toBeGreaterThanOrEqual(0.95);

    // Firefighter — exactly the seeded demo account.
    expect(body.firefighterCount).toBe(1);

    // Incidents — exactly 6 per the AC.
    expect(body.incidentCount).toBe(6);

    // Type coverage — need ≥4 distinct types so the filter UI has variety.
    expect(Object.keys(body.incidentsByType).length).toBeGreaterThanOrEqual(4);

    // Linkage — every incident must be owned by the demo firefighter
    // (badge 0418). If exactly one badge owns all incidents AND that
    // badge is 0418, the relation is correctly wired.
    expect(body.incidentOwnerBadges).toEqual(["0418"]);
  });
});
