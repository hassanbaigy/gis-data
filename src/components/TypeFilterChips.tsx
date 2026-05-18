"use client";

/**
 * TypeFilterChips (HF-009) — six-chip multi-select group for the
 * `/history` type filter.
 *
 * Per STORY.md D2: all 6 chips render in a 2-row × 3-col grid on phone.
 * Chips never hide; they remain tap-targets in their fixed positions.
 * When more than 3 are selected, a non-interactive `+N` summary chip
 * appears next to the group (where N = selectedTypes.length - 3, or
 * exact count − a reasonable label — see below).
 *
 * The `+N` chip is informational only — `aria-hidden="false"` for
 * screen-reader visibility but no role="button" and no `onClick`. Read
 * as "plus N selected" by AT.
 *
 * `aria-pressed` on each chip drives the Playwright test assertions
 * (T03, T06, T07).
 */

// VALID_TYPES from the brief — matches POST /api/incidents validation
// (Dev A's handler) and the seed's `Incident.type` values.
const CHIPS: { value: string; label: string }[] = [
  { value: "STRUCTURE", label: "STRUCTURE" },
  { value: "VEHICLE", label: "VEHICLE" },
  { value: "BRUSH", label: "BRUSH" },
  { value: "MEDICAL", label: "MEDICAL" },
  { value: "HAZMAT", label: "HAZMAT" },
  { value: "OTHER", label: "OTHER" },
];

// Per D2 — the `+N` summary chip appears when selected count > 3. The
// "N" displayed is the EXCESS over 3, matching common +N overflow
// conventions (e.g. "+2" means 2 more beyond the first 3). Easy to
// tweak: change `selectedTypes.length - 3` to `selectedTypes.length`
// for a "total selected" display style.
const PLUS_N_THRESHOLD = 3;

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
};

export function TypeFilterChips({ selected, onChange }: Props) {
  const selectedSet = new Set(selected);
  const overflow = Math.max(0, selected.length - PLUS_N_THRESHOLD);

  return (
    <div
      role="group"
      aria-label="Incident type filter"
      className="flex flex-wrap items-center gap-2"
    >
      <div className="grid grid-cols-3 gap-2">
        {CHIPS.map((chip) => {
          const active = selectedSet.has(chip.value);
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={active ? "true" : "false"}
              onClick={() => {
                const next = active
                  ? selected.filter((t) => t !== chip.value)
                  : [...selected, chip.value];
                onChange(next);
              }}
              className={chipClass(active)}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {overflow > 0 ? (
        // Non-interactive count summary. Styled like an active chip
        // (yellow + black) to read as a count, not a tap target. Per D2
        // it never hides individual chips — purely informational.
        <span
          aria-label={`Plus ${overflow} more selected`}
          className="px-3 py-1.5 bg-yellow/20 text-yellow font-mono text-xs font-bold uppercase tracking-wider border border-yellow/40"
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function chipClass(active: boolean): string {
  const base =
    "px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-yellow/60";
  return active
    ? `${base} bg-yellow text-black`
    : `${base} bg-transparent text-smoke border border-smoke hover:text-paper hover:border-paper/60`;
}
