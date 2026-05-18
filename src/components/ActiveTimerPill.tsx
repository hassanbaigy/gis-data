"use client";

/**
 * ActiveTimerPill (HF-008) — pulsing red pill at the top of
 * /map/incident/[id] that counts up from `createdAt`.
 *
 * Output format: `ACTIVE · MM:SS` (matches the AC regex
 * /ACTIVE\s*·\s*\d{2}:\d{2}/). The MM:SS pair is computed from
 * Date.now() - new Date(createdAt).getTime() on every tick, NOT
 * accumulated by counting — this avoids timer drift when the tab
 * sleeps and re-wakes.
 *
 * Cleanup: clearInterval on unmount avoids Playwright's
 * "operation after test ended" errors and the React unmount-warning
 * for state updates after teardown.
 */

import { useEffect, useState } from "react";

type Props = {
  /** Incident.createdAt as an ISO string (server-serialised). */
  createdAt: string;
};

export function ActiveTimerPill({ createdAt }: Props) {
  // Re-render every second to recompute the elapsed text.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const started = new Date(createdAt).getTime();
  const elapsedSec = Number.isFinite(started)
    ? Math.max(0, Math.floor((Date.now() - started) / 1000))
    : 0;
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  return (
    <div
      className="inline-flex items-center gap-2 bg-red/95 px-3 py-1.5 shadow-[0_4px_16px_rgba(225,29,41,0.4)] backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <span
        className="h-2 w-2 animate-pulse rounded-full bg-paper"
        aria-hidden="true"
      />
      <span className="font-mono text-sm font-bold uppercase tracking-wider text-paper">
        ACTIVE · {mm}:{ss}
      </span>
    </div>
  );
}
