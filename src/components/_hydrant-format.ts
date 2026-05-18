/**
 * Local formatting helpers for HF-008 hydrant rendering. Internal to the
 * `src/components/` HF-008 components (`HydrantCard`, `HydrantsModal`) —
 * not a general utility module. Prefix `_` signals "private to this
 * feature's components".
 *
 * Distance: metres → feet under 1000 ft, miles above. Rounded to nearest
 *           10 ft for tactical readability (firefighters think in 50/100
 *           ft hose sections).
 * ETA:      seconds → MM:SS (matches the spec's "ETA yellow mono" pattern;
 *           regex `/\d+:\d{2}/`).
 */

const METRES_PER_FOOT = 3.28084;
const METRES_PER_MILE = 1609.344;

export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return "—";
  const ft = metres * METRES_PER_FOOT;
  if (ft < 1000) {
    return `${Math.round(ft / 10) * 10} FT`;
  }
  const mi = metres / METRES_PER_MILE;
  return `${mi.toFixed(1)} MI`;
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.floor(seconds);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
}
