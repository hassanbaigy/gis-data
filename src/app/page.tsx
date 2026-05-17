/**
 * Root redirect gate (HF-001).
 *
 * Replaces the HF-000 bootstrap wordmark. This route renders nothing — it
 * checks the `hf_badge` cookie and redirects:
 *   - cookie absent → /login
 *   - cookie present → /map  (404 until HF-005 ships; that's expected)
 *
 * Notes:
 *   - `cookies()` is async in Next 16 — must be awaited.
 *   - `redirect()` throws NEXT_REDIRECT internally; both calls are at the
 *     top of the function, OUTSIDE any try/catch, per Next 16 docs.
 *   - This is a Server Component — there is no `'use client'` here.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { HF_BADGE_COOKIE } from "@/lib/auth";

export default async function Home() {
  const cookieStore = await cookies();
  const hasBadge = cookieStore.has(HF_BADGE_COOKIE);

  if (hasBadge) {
    redirect("/map");
  }
  redirect("/login");
}
