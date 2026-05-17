import { test, expect } from "@playwright/test";

/**
 * HF-004 MapView spec — verifies the reusable Mapbox component.
 *
 * The map renders on a WebGL canvas which Playwright cannot query like
 * normal DOM. The component exposes a hidden <div data-hf-map-state>
 * with sync'd attributes (marker-count, marker-types, has-route, status)
 * as the testable seam.
 */

const FIXTURE = "/dev/mapview";

test.describe("HF-004 MapView", () => {
  test("dev fixture renders four marker types + a route", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto(FIXTURE);

    // The state surface appears immediately; wait for it to flip to "ready"
    // once the Mapbox style + layers are loaded.
    const stateSurface = page.locator("[data-hf-map-state]");
    await expect(stateSurface).toBeVisible();
    await expect(stateSurface).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // The fixture renders one of each: chosen, hydrant, incident, oos.
    await expect(stateSurface).toHaveAttribute("data-marker-count", "4");
    await expect(stateSurface).toHaveAttribute(
      "data-marker-types",
      "chosen,hydrant,incident,oos",
    );

    // A sample route LineString is provided.
    await expect(stateSurface).toHaveAttribute("data-has-route", "true");

    // Mapbox GL canvas is mounted
    await expect(page.locator(".mapboxgl-canvas")).toBeVisible();

    // Screenshot for visual rubric scoring
    await page.screenshot({
      path: "tests/screenshots/hf-004-mapview/01-fixture-loaded.png",
      fullPage: true,
    });

    expect(
      consoleErrors,
      `console had errors: ${consoleErrors.join(" · ")}`,
    ).toEqual([]);
  });

  test("cleanup: mounting and unmounting twice produces no errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    // Mount once
    await page.goto(FIXTURE);
    await page
      .locator("[data-hf-map-state][data-status='ready']")
      .waitFor({ timeout: 15_000 });

    // Navigate away — component unmounts
    await page.goto("/");

    // Mount again
    await page.goto(FIXTURE);
    await page
      .locator("[data-hf-map-state][data-status='ready']")
      .waitFor({ timeout: 15_000 });

    // And away again
    await page.goto("/");

    expect(
      consoleErrors,
      `console had errors after mount/unmount cycles: ${consoleErrors.join(" · ")}`,
    ).toEqual([]);
  });
});
