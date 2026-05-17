"use client";

/**
 * Login form (HF-001) — interactive child of `/login`.
 *
 * Behaviour:
 *   - Badge: single 4-digit input. Only digits accepted; max length 4.
 *   - PIN:   4 single-digit cells. Typing advances focus; Backspace on an
 *            empty cell jumps back; Arrow keys navigate. Active cell border
 *            turns yellow (D1 visual spec).
 *   - SIGN IN CTA: disabled (aria-disabled + opacity 0.5) until both badge
 *                  and PIN are complete. Pressing Enter on the form has the
 *                  same effect as clicking the CTA.
 *   - Submit:  POSTs `{ badge, pin }` as JSON to `/api/auth/sign-in`.
 *              On `{ ok: true }` we `router.push('/map')` (D3 — client
 *              navigation, not a server redirect). On error, surface a
 *              small message under the form.
 *
 * Next 16 gotcha honoured: `redirect()` cannot be called from a client
 * event handler. We use `useRouter().push` instead. (See
 * .claude/agent-context/scaffold-state.md "Next 16 cookies + redirect".)
 */

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const PIN_LENGTH = 4;

export default function LoginForm() {
  const router = useRouter();
  const badgeId = useId();

  const [badge, setBadge] = useState("");
  const [pinDigits, setPinDigits] = useState<string[]>(
    Array(PIN_LENGTH).fill(""),
  );
  const [activePinIdx, setActivePinIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pinRefs = useRef<Array<HTMLInputElement | null>>([]);

  const badgeOk = /^\d{4}$/.test(badge);
  const pinOk = pinDigits.every((d) => /^\d$/.test(d));
  const isValid = badgeOk && pinOk;
  const blocked = !isValid || submitting;

  function handleBadgeChange(value: string) {
    setBadge(value.replace(/\D/g, "").slice(0, 4));
  }

  function setPinAt(idx: number, raw: string) {
    // Accept only the last digit typed; clear if user wiped the cell.
    const digit = raw.replace(/\D/g, "").slice(-1);
    setPinDigits((prev) => {
      const next = prev.slice();
      next[idx] = digit;
      return next;
    });
    if (digit && idx < PIN_LENGTH - 1) {
      pinRefs.current[idx + 1]?.focus();
    }
  }

  function handlePinKeyDown(
    idx: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace" && !pinDigits[idx] && idx > 0) {
      pinRefs.current[idx - 1]?.focus();
    } else if (e.key === "ArrowLeft" && idx > 0) {
      pinRefs.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx < PIN_LENGTH - 1) {
      pinRefs.current[idx + 1]?.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (blocked) return;

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ badge, pin: pinDigits.join("") }),
      });
      const json = (await res
        .json()
        .catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError("Sign in failed. Check your badge and PIN, then try again.");
        setSubmitting(false);
        return;
      }
      // D3 — JSON response + client navigation. router.push triggers the
      // RSC payload for /map; refresh() forces the server gate on / to
      // re-read cookies on the next root visit.
      router.push("/map");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-7">
      {/* Badge */}
      <div className="space-y-2">
        <label
          htmlFor={badgeId}
          className="block font-mono text-[11px] uppercase tracking-[0.18em] text-paper/60"
        >
          Badge Number
        </label>
        <input
          id={badgeId}
          aria-label="Badge number"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={4}
          value={badge}
          onChange={(e) => handleBadgeChange(e.target.value)}
          placeholder="0000"
          className="w-full bg-transparent border-b border-paper/20 px-1 py-2 font-mono text-[22px] tracking-[0.4em] text-paper placeholder:text-paper/20 outline-none transition-colors focus:border-yellow"
        />
      </div>

      {/* PIN — 4 separate cells */}
      <div className="space-y-2">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/60">
          PIN
        </div>
        <div
          role="group"
          aria-label="PIN code"
          className="flex gap-3"
        >
          {pinDigits.map((digit, idx) => {
            const active = activePinIdx === idx;
            return (
              <input
                key={idx}
                ref={(el) => {
                  pinRefs.current[idx] = el;
                }}
                aria-label={`PIN digit ${idx + 1}`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={1}
                value={digit}
                onChange={(e) => setPinAt(idx, e.target.value)}
                onKeyDown={(e) => handlePinKeyDown(idx, e)}
                onFocus={() => setActivePinIdx(idx)}
                onBlur={() => setActivePinIdx(null)}
                className={[
                  "h-14 w-14 bg-transparent border text-center font-mono text-[22px] text-paper outline-none transition-colors",
                  active ? "border-yellow" : "border-paper/20",
                ].join(" ")}
              />
            );
          })}
        </div>
      </div>

      {/* Error state (D3 — surfaced from failed POST) */}
      {error ? (
        <p
          role="alert"
          className="font-mono text-[12px] uppercase tracking-[0.14em] text-red"
        >
          {error}
        </p>
      ) : null}

      {/* SIGN IN CTA — aria-disabled gates click navigation, opacity gates visual */}
      <button
        type="submit"
        aria-disabled={blocked || undefined}
        onClick={(e) => {
          if (blocked) e.preventDefault();
        }}
        className={[
          "block w-full bg-red px-6 py-4 text-center font-display text-lg font-extrabold uppercase tracking-[0.18em] text-paper",
          "shadow-[0_8px_32px_rgba(225,29,41,0.35)]",
          "transition-opacity",
          blocked ? "opacity-50" : "opacity-100",
        ].join(" ")}
      >
        Sign In →
      </button>
    </form>
  );
}
