import { test, expect } from "@playwright/test";

/**
 * HF-007 integration spec — POST /api/hydrants/nearest.
 *
 * Hits the live endpoint with seeded Gorham, ME data. Mapbox calls are
 * real (one Matrix call + one Directions call per request). Costs are
 * negligible inside the free tier and the seed concentrates hydrants
 * within ~5km so call latency is predictable.
 *
 * The point at (43.6791, -70.4444) is the Gorham town centroid — the seed
 * places ~454 in-service hydrants and ~2 out-of-service ones within
 * routing distance.
 */

const ENDPOINT = "/api/hydrants/nearest";

// Gorham, ME centroid — well inside the seeded hydrant cluster.
const GORHAM = { lat: 43.6791, lng: -70.4444 };

test.describe("HF-007 POST /api/hydrants/nearest", () => {
  test("returns top 3 in-service hydrants ranked by routed duration", async ({
    playwright,
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.PW_BASE_URL ?? "http://localhost:3000",
    });

    const res = await ctx.post(ENDPOINT, { data: GORHAM });
    expect(
      res.ok(),
      `expected 200 from ${ENDPOINT}, got ${res.status()} body=${await res.text()}`,
    ).toBe(true);

    const body = (await res.json()) as {
      nearest: Array<{
        hydrant: { id: string; inService: boolean; lat: number; lng: number };
        distanceM: number;
        durationS: number;
        geometry?: GeoJSON.LineString;
      }>;
      flaggedOos: Array<{
        hydrant: { id: string; inService: boolean };
        distanceM: number;
      }>;
      degraded?: boolean;
    };

    // Shape and count
    expect(body.nearest, "nearest must be an array").toBeInstanceOf(Array);
    expect(body.nearest.length).toBe(3);

    // All three must be in-service with valid coords
    for (const item of body.nearest) {
      expect(item.hydrant.inService).toBe(true);
      expect(item.hydrant.lat).toBeGreaterThan(40);
      expect(item.hydrant.lat).toBeLessThan(46);
      expect(item.hydrant.lng).toBeGreaterThan(-72);
      expect(item.hydrant.lng).toBeLessThan(-68);
      expect(item.distanceM).toBeGreaterThan(0);
      expect(item.durationS).toBeGreaterThan(0);
    }

    // Duration must be monotonically non-decreasing
    expect(body.nearest[0].durationS).toBeLessThanOrEqual(body.nearest[1].durationS);
    expect(body.nearest[1].durationS).toBeLessThanOrEqual(body.nearest[2].durationS);

    // Only #1 has the route geometry. The others must not.
    if (!body.degraded) {
      expect(body.nearest[0].geometry).toBeTruthy();
      expect(body.nearest[0].geometry?.type).toBe("LineString");
      expect(body.nearest[0].geometry?.coordinates.length).toBeGreaterThan(1);
      expect(body.nearest[1].geometry).toBeUndefined();
      expect(body.nearest[2].geometry).toBeUndefined();
    }

    // flaggedOos: 0-2 items, all out-of-service, haversine only (no duration)
    expect(body.flaggedOos.length).toBeLessThanOrEqual(2);
    for (const oos of body.flaggedOos) {
      expect(oos.hydrant.inService).toBe(false);
      expect(oos.distanceM).toBeGreaterThan(0);
      // Crucially: no durationS, no geometry on OOS entries
      expect((oos as Record<string, unknown>).durationS).toBeUndefined();
      expect((oos as Record<string, unknown>).geometry).toBeUndefined();
    }

    // The Mapbox secret token must NEVER appear in the response. We check
    // both the literal token value from env (catches any echo path) AND
    // the env-var name (catches any accidental serialisation of process.env).
    const bodyText = JSON.stringify(body);
    const secretToken = process.env.MAPBOX_SECRET_TOKEN;
    if (secretToken) expect(bodyText).not.toContain(secretToken);
    expect(bodyText).not.toContain("sk.");
    expect(bodyText).not.toContain("MAPBOX_SECRET_TOKEN");

    await ctx.dispose();
  });

  test("k=1 returns one result", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.PW_BASE_URL ?? "http://localhost:3000",
    });
    const res = await ctx.post(ENDPOINT, { data: { ...GORHAM, k: 1 } });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { nearest: unknown[] };
    expect(body.nearest.length).toBe(1);
    await ctx.dispose();
  });

  test("rejects invalid bodies with 400", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.PW_BASE_URL ?? "http://localhost:3000",
    });

    // Missing fields
    let res = await ctx.post(ENDPOINT, { data: {} });
    expect(res.status()).toBe(400);

    // Lat out of range
    res = await ctx.post(ENDPOINT, { data: { lat: 999, lng: 0 } });
    expect(res.status()).toBe(400);

    // Lng out of range
    res = await ctx.post(ENDPOINT, { data: { lat: 0, lng: -200 } });
    expect(res.status()).toBe(400);

    // NaN-y
    res = await ctx.post(ENDPOINT, {
      data: { lat: "not a number", lng: 0 },
    });
    expect(res.status()).toBe(400);

    // k out of range
    res = await ctx.post(ENDPOINT, { data: { ...GORHAM, k: 0 } });
    expect(res.status()).toBe(400);

    // k above MAX_K
    res = await ctx.post(ENDPOINT, { data: { ...GORHAM, k: 11 } });
    expect(res.status()).toBe(400);

    // k not an integer
    res = await ctx.post(ENDPOINT, { data: { ...GORHAM, k: 1.5 } });
    expect(res.status()).toBe(400);

    await ctx.dispose();
  });
});
