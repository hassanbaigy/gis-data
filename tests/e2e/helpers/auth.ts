import type { BrowserContext, PlaywrightWorkerArgs } from "@playwright/test";

type Playwright = PlaywrightWorkerArgs["playwright"];

/**
 * Shared auth helpers for Playwright specs. Use after HF-001 added the
 * `hf_badge` cookie gate to every /map/* page and every Mapbox-touching
 * API route.
 *
 * Tests don't go through the real /api/auth/sign-in flow — they short-
 * circuit by setting the cookie directly. The seeded firefighter (badge
 * 0418) is guaranteed to exist, so requireFirefighter() inside protected
 * routes will succeed.
 */

export const DEMO_BADGE = "0418";

/** Inject the auth cookie into a browser context so `page.goto('/map/...')` works. */
export async function loginInContext(
  context: BrowserContext,
  badge: string = DEMO_BADGE,
): Promise<void> {
  await context.addCookies([
    {
      name: "hf_badge",
      value: badge,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      // Long enough that no test will outlive it.
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    },
  ]);
}

/** Build an APIRequestContext that always sends the auth cookie. */
export async function authedRequestContext(
  playwright: Playwright,
  badge: string = DEMO_BADGE,
) {
  return playwright.request.newContext({
    baseURL: process.env.PW_BASE_URL ?? "http://localhost:3000",
    extraHTTPHeaders: { Cookie: `hf_badge=${badge}` },
  });
}
