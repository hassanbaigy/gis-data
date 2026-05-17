/**
 * POST /api/auth/sign-in — mock auth (HF-001).
 *
 * Body: { badge: string, pin: string } — both must be exactly 4 digits.
 * Success: 200 { ok: true } and `hf_badge` cookie is set (httpOnly, 8h).
 * Validation failure: 400 { ok: false, error: 'invalid_badge' | 'invalid_pin' | 'invalid_json' }
 * Server error: 500 { ok: false, error: 'server_error' }
 *
 * The PIN is format-validated here and DELIBERATELY NOT FORWARDED to the
 * library layer or the DB. We do not log it, hash it, or store it. Per the
 * brief: "Any 4+4 succeeds." This is a mock.
 */

import { signIn } from "@/lib/auth";

const FOUR_DIGITS = /^\d{4}$/;

export async function POST(req: Request): Promise<Response> {
  // Parse body. Reject any non-JSON payload with 400, no surprises.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const { badge, pin } =
    (body as { badge?: unknown; pin?: unknown } | null) ?? {};

  if (typeof badge !== "string" || !FOUR_DIGITS.test(badge)) {
    return Response.json(
      { ok: false, error: "invalid_badge" },
      { status: 400 },
    );
  }
  if (typeof pin !== "string" || !FOUR_DIGITS.test(pin)) {
    return Response.json(
      { ok: false, error: "invalid_pin" },
      { status: 400 },
    );
  }

  // pin is validated; intentionally not propagated further.
  try {
    await signIn(badge);
  } catch (err) {
    // Log the error message only — never log the request body (would leak the
    // PIN) or the badge (would leak which firefighter just had a server-side
    // error). Stack/message is enough to diagnose.
    console.error(
      "[hf-001] sign-in failed:",
      err instanceof Error ? err.message : "unknown",
    );
    return Response.json(
      { ok: false, error: "server_error" },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
