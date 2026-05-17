/**
 * Mock auth (HF-001).
 *
 * The brief is explicit: this is a prototype. Any 4-digit badge + any 4-digit
 * PIN is accepted. The PIN is validated at the route boundary (4-digit format)
 * and is INTENTIONALLY NOT propagated into this module — `signIn` takes only
 * the badge, which becomes the `hf_badge` cookie value and the upserted
 * `Firefighter.badge`. We do not log, hash, or store the PIN.
 *
 * Security posture (matches STORY.md decisions D1 + D2):
 *   - httpOnly: true        — client JS cannot read the cookie
 *   - sameSite: 'lax'       — sane cross-origin behaviour for POST navigations
 *   - path: '/'             — cookie applies to the whole app
 *   - secure: NODE_ENV==='production'  — required on https, must be off on http://localhost
 *   - maxAge: 28800 (8 h)   — survives a firefighter's shift across browser restarts
 *
 * Next 16 quirks honoured here (verified against node_modules/next/dist/docs):
 *   - `cookies()` is async — always `await cookies()`. Synchronous calls
 *     return a Promise object, not the cookie store.
 *   - `redirect()` throws an internal NEXT_REDIRECT error — it must be called
 *     OUTSIDE any try/catch block, else the throw is swallowed and the redirect
 *     silently fails.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";

export const HF_BADGE_COOKIE = "hf_badge";
export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours — one shift

/**
 * Build the cookie option bag for `hf_badge`. Single source of truth so the
 * sign-in route, sign-out route (if added), and any future re-issue paths
 * stay consistent.
 */
export function hfBadgeCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

/**
 * Sign a firefighter in by badge. Upserts the `Firefighter` row (so a fresh
 * badge value works without manual seeding) and sets the `hf_badge` cookie.
 *
 * Call ONLY from a Route Handler or Server Function — `cookies().set` cannot
 * write headers from a plain Server Component render.
 *
 * @param badge - 4-digit string. Caller is responsible for format validation.
 */
export async function signIn(badge: string): Promise<void> {
  // Upsert is idempotent. Re-signing the same badge is a no-op on DB shape;
  // the cookie is refreshed regardless (extends the 8h window).
  await prisma.firefighter.upsert({
    where: { badge },
    update: {},
    create: { badge },
    // `unitId` defaults to "E-12" in the schema — don't pass it here, let
    // the default apply. If the brief later requires per-badge unit mapping,
    // that's an HF-001-follow-up, not part of this story.
  });

  const cookieStore = await cookies();
  cookieStore.set(HF_BADGE_COOKIE, badge, hfBadgeCookieOptions());
}

/**
 * Read the `hf_badge` cookie. Returns the badge string if present, else null.
 *
 * Safe to call from any Server Component / Route Handler — does not mutate.
 */
export async function readBadge(): Promise<string | null> {
  const cookieStore = await cookies();
  const c = cookieStore.get(HF_BADGE_COOKIE);
  return c?.value ?? null;
}

/**
 * Guard for protected pages and route handlers. Reads the cookie and:
 *   - returns the badge string if present
 *   - calls `redirect('/login')` if missing
 *
 * Per AC: exported as `requireBadge`. The `redirect()` call must NOT be
 * inside any try/catch in callers — it throws NEXT_REDIRECT internally.
 *
 * Usage:
 *   const badge = await requireBadge();   // typed as string after this line
 */
export async function requireBadge(): Promise<string> {
  const badge = await readBadge();
  if (!badge) {
    redirect("/login");
  }
  return badge;
}

/**
 * Stronger guard: requires both the cookie AND a matching `Firefighter` row.
 * Useful for routes that immediately need the user's `unitId` or DB id.
 * Falls back to `/login` if either check fails.
 */
export async function requireFirefighter() {
  const badge = await requireBadge();

  const firefighter = await prisma.firefighter.findUnique({ where: { badge } });
  if (!firefighter) {
    // Cookie present but no DB row — sign-in flow upserts, so this should
    // only happen if the DB was wiped under us. Send them through /login
    // which will re-upsert on submit.
    redirect("/login");
  }

  return firefighter;
}
