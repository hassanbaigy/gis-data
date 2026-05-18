/**
 * HydrantCard (HF-008) — per-result card in the bottom-sheet results list.
 *
 * Layout: big rank digit (display) + hydrant id (mono) + address (display) +
 * distance (display) + ETA (yellow mono). #1 (rank === 1, not OOS) gets a
 * 1.5px yellow border and a warmer yellow-tinted background. OOS cards
 * carry `data-oos="true"` and render a red `OUT` chip.
 *
 * Test-seam contract (failing spec):
 *   - `data-rank="<n>"` on the root element (1, 2, or 3)
 *   - `data-oos="true"` when isOos is true
 *   - Hydrant id rendered as text matching /[A-Z]+-?[A-Z]*\d+/ (seed IDs)
 *   - Address rendered as visible text
 *   - ETA rendered as MM:SS (matches /\d+:\d{2}/)
 */

import { formatDistance, formatEta } from "./_hydrant-format";

type HydrantLike = {
  id: string;
  address: string;
};

type Props = {
  /** 1, 2, 3 for in-service top-3; OOS entries pass their original rank or 0. */
  rank: number;
  hydrant: HydrantLike;
  /** Routed driving distance in metres. For OOS entries, haversine distance. */
  distanceM: number;
  /**
   * Routed driving duration in seconds. Optional because flagged-OOS entries
   * carry haversine distance only — no Matrix call was made for them.
   */
  durationS?: number;
  isOos?: boolean;
};

export function HydrantCard({
  rank,
  hydrant,
  distanceM,
  durationS,
  isOos,
}: Props) {
  const isPrimary = rank === 1 && !isOos;

  const wrapperClasses = [
    "flex items-stretch gap-3 p-3",
    isPrimary
      ? "border-[1.5px] border-yellow bg-yellow/[0.06]"
      : "border border-paper/10 bg-black/40",
    isOos ? "opacity-80" : "",
  ].join(" ");

  return (
    <article
      // OOS cards skip `data-rank` so test 07's `[data-rank='N']` locator
      // never picks up an OOS row by mistake when the bottom sheet renders
      // both the top-3 nearest AND the flagged OOS list.
      data-rank={isOos ? undefined : String(rank)}
      data-oos={isOos ? "true" : undefined}
      className={wrapperClasses}
      aria-label={`Hydrant${isOos ? " out of service" : ` rank ${rank}`}: ${hydrant.id}`}
    >
      {/* Big rank digit — suppressed for OOS cards (reviewer H2). OOS rows
          aren't ranked in the same sequence as the top-3, so the modal
          uses a `·` placeholder there too. Keeps the visual hierarchy
          honest: only ranks 1, 2, 3 read as competing in driving-time
          order. */}
      <div
        className="flex h-12 w-12 flex-shrink-0 items-center justify-center font-display text-4xl font-extrabold leading-none text-paper"
        aria-hidden="true"
      >
        {isOos ? "·" : rank}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        {/* Id + OUT chip */}
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-xs text-paper/80">
            {hydrant.id}
          </span>
          {isOos ? (
            <span className="bg-red px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-paper">
              OUT
            </span>
          ) : null}
        </div>

        {/* Address */}
        <p className="truncate font-display text-sm leading-snug text-paper">
          {hydrant.address}
        </p>

        {/* Distance + ETA */}
        <div className="mt-1 flex items-baseline gap-3">
          <span className="font-display text-lg font-extrabold leading-none text-paper">
            {formatDistance(distanceM)}
          </span>
          {durationS !== undefined ? (
            <span className="font-mono text-xs font-bold text-yellow">
              {formatEta(durationS)}
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-wider text-paper/40">
              No route
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
