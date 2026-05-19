"use client";

/**
 * FilterChips (HF-005) — the three-chip filter rail above the dark map.
 *
 * Behaviour per STORY.md decision D1:
 *   - `[ALL · N]` and `[7 DAYS]` are a mutually-exclusive pair (radio-like).
 *     Exactly one is active (yellow) at a time.
 *   - First load: `[7 DAYS]` is active, `[ALL · N]` is smoke.
 *   - Tapping `[ALL]` flips to since="all" (no-op if already there).
 *   - Tapping the already-active `[7 DAYS]` flips back to since="all".
 *   - `[UNIT E-12]` is an independent toggle (yellow when active, smoke
 *     when inactive). First load: active.
 *
 * `aria-pressed` is the accessible toggle pattern Playwright asserts on.
 */

export type SinceFilter = "7d" | "all";

type Props = {
  since: SinceFilter;
  unitActive: boolean;
  count: number;
  unitId: string;
  onSinceChange: (next: SinceFilter) => void;
  onUnitToggle: () => void;
};

export function FilterChips({
  since,
  unitActive,
  count,
  unitId,
  onSinceChange,
  onUnitToggle,
}: Props) {
  const allActive = since === "all";
  const sevenActive = since === "7d";

  return (
    <div className="flex gap-2 rounded-md bg-black/60 p-2 backdrop-blur-sm">
      <button
        type="button"
        aria-pressed={allActive ? "true" : "false"}
        onClick={() => onSinceChange("all")}
        className={chipClass(allActive)}
      >
        ALL · {count}
      </button>
      <button
        type="button"
        aria-pressed={sevenActive ? "true" : "false"}
        // Tapping an already-active 7 DAYS deactivates it → falls back to ALL
        // per D1's "Tapping the already-active [7 DAYS] returns to [ALL · N]".
        onClick={() => onSinceChange(sevenActive ? "all" : "7d")}
        className={chipClass(sevenActive)}
      >
        7 DAYS
      </button>
      <button
        type="button"
        aria-pressed={unitActive ? "true" : "false"}
        onClick={onUnitToggle}
        className={chipClass(unitActive)}
      >
        UNIT {unitId}
      </button>
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
