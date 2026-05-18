"use client";

/**
 * TimeFilterChips (HF-009) — three-chip single-select rail for the
 * `/history` time filter: `7D` / `30D` / `ALL`.
 *
 * New component (not a refactor of HF-005's `FilterChips`) because the
 * existing component's `SinceFilter` type union is `"7d" | "all"` only —
 * no `30d` option. HF-005 chose two values; HF-009 needs three.
 *
 * Behaviour:
 *   - Single-select radio: exactly one chip is active at any time.
 *   - Default state passed in via `value` prop (typically `"7d"`).
 *   - Tapping an inactive chip → `onChange(newValue)`.
 *   - Tapping the already-active chip → no-op (parent's effect dep
 *     wouldn't fire on identity-equal state anyway, but we short-circuit
 *     to be explicit).
 *
 * `aria-pressed` carries the toggle state — Playwright asserts on it
 * (T03 + T05 in the spec).
 */

export type SinceFilter = "7d" | "30d" | "all";

const CHIPS: { value: SinceFilter; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "all", label: "ALL" },
];

type Props = {
  value: SinceFilter;
  onChange: (next: SinceFilter) => void;
};

export function TimeFilterChips({ value, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Time filter"
      className="flex gap-2"
    >
      {CHIPS.map((chip) => {
        const active = value === chip.value;
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={active ? "true" : "false"}
            onClick={() => {
              if (!active) onChange(chip.value);
            }}
            className={chipClass(active)}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

function chipClass(active: boolean): string {
  // Same visual treatment as HF-005's FilterChips. Local class function
  // duplicated intentionally to avoid coupling — refactor to a shared
  // helper is a future chore.
  const base =
    "px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-yellow/60";
  return active
    ? `${base} bg-yellow text-black`
    : `${base} bg-transparent text-smoke border border-smoke hover:text-paper hover:border-paper/60`;
}
