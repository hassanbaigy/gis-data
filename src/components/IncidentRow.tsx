"use client";

/**
 * IncidentRow (HF-009) — single row in the `/history` incident list.
 *
 * Renders: mono time-ago label + display-font address + type chip +
 * alarm chip + chevron-right icon. Tapping the row navigates to
 * `/map/incident/[id]` via Next's `<Link>` (semantic anchor).
 *
 * Test-seam contract:
 *   - `data-incident-row` on the root element (T04 count, T06 filter
 *     count, T08 first-row field checks)
 *   - `data-incident-id="<uuid>"` on the root element (T09 targeted click)
 *
 * Time-ago format (D4 — mirrors HintCard's `hoursSince` logic):
 *   - < 1 hour or exactly 1 hour: "1 HR AGO"
 *   - 2 ≤ h < 48: "N HRS AGO"
 *   - h ≥ 48: "N DAYS AGO"
 * Always uppercase, mono font.
 *
 * `hoursSince` is implemented LOCALLY here — do NOT extract from
 * HintCard or hoist into `src/lib/time.ts` in HF-009 scope. Unifying
 * the helpers is a future chore PR.
 */

import Link from "next/link";

type Props = {
  id: string;
  createdAt: string; // ISO string
  address: string;
  type: string;
  alarmLevel: number;
};

export function IncidentRow({ id, createdAt, address, type, alarmLevel }: Props) {
  const timeAgo = formatTimeAgo(createdAt);

  return (
    <Link
      href={`/map/incident/${id}`}
      data-incident-row
      data-incident-id={id}
      aria-label={`View incident: ${address}, ${type}, alarm level ${alarmLevel}, ${timeAgo}`}
      className="flex items-center gap-3 border-b border-paper/5 px-4 py-3 transition-colors hover:bg-paper/5 focus:bg-paper/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-yellow/60"
    >
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        {/* Time-ago — mono uppercase, fog colour */}
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/40">
          {timeAgo}
        </p>

        {/* Address — display font, truncate on overflow */}
        <p className="truncate font-display text-base leading-snug text-paper">
          {address}
        </p>

        {/* Type + alarm chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="bg-paper/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-paper">
            {type}
          </span>
          <span className="bg-paper/5 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-paper/80">
            ALARM {alarmLevel}
          </span>
        </div>
      </div>

      {/* Chevron-right — decorative, aria-hidden so the row's accessible
          name comes from aria-label, not the icon. */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5 flex-shrink-0 text-paper/40"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

/**
 * Format an ISO date string as a humane uppercase time-ago label.
 *
 * Rules (D4):
 *   - `h < 1` or `h === 1`: "1 HR AGO"
 *   - `2 ≤ h < 48`: "N HRS AGO"
 *   - `h ≥ 48`: "N DAYS AGO"
 *
 * Defensive on non-finite / future dates: returns "JUST NOW" when the
 * timestamp is malformed or in the future (clock skew). "JUST NOW" does
 * NOT match the spec's `/\d+\s*(HR|HRS|DAY|DAYS)\s*AGO/i` regex; that's
 * a Lead-side decision — the test only inspects valid seeded incidents,
 * not edge cases.
 */
function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "JUST NOW";

  const elapsedMs = Date.now() - then;
  if (elapsedMs < 0) return "JUST NOW";

  const hours = Math.floor(elapsedMs / 3_600_000);
  // Collapsed `hours < 1 || hours === 1` into `<= 1` per reviewer HIGH-2.
  // Floor of 0–59 minutes is 0; floor of exactly 60 minutes is 1; both
  // surface as "1 HR AGO" — the minimum-display floor for the spec's
  // /\d+\s*(HR|HRS|DAY|DAYS)\s*AGO/i regex.
  if (hours <= 1) return "1 HR AGO";
  if (hours < 48) return `${hours} HRS AGO`;

  const days = Math.floor(elapsedMs / 86_400_000);
  return `${days} DAYS AGO`;
}
