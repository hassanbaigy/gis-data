"use client";

/**
 * HydrantsModal (HF-008) — full-list modal opened by the list-icon footer
 * button on /map/incident/[id]. Shows the top-3 nearest hydrants AND the
 * flagged OOS entries in a longer list format.
 *
 * Per STORY.md decision D4: same data as the bottom-sheet screen, just a
 * longer list. One row per hydrant: mono id + address + distance + ETA.
 * No filters, no sort controls, no per-row actions.
 *
 * Test-seam contract:
 *   - `role="dialog"` + `aria-modal="true"` on the outer container
 *   - Close button has `aria-label="Close"`
 *   - Each row has `data-hydrant-id="<id>"` so test 11 can locate them
 *   - Escape key closes
 *   - Clicking the backdrop closes (clicking the panel does NOT)
 */

import { useEffect, useRef } from "react";

import { formatDistance, formatEta } from "./_hydrant-format";

type HydrantLike = {
  id: string;
  address: string;
};

export type HydrantEntry = {
  rank: number;
  hydrant: HydrantLike;
  distanceM: number;
  durationS?: number;
  isOos?: boolean;
};

type Props = {
  entries: HydrantEntry[];
  onClose: () => void;
};

export function HydrantsModal({ entries, onClose }: Props) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Esc closes; auto-focus the close button on open for keyboard users.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    // queueMicrotask so React commits the dialog before we focus into it
    queueMicrotask(() => closeBtnRef.current?.focus());
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      // Reviewer M2 — point the dialog's accessible name at the VISIBLE
      // heading rather than a hidden aria-label that differs in wording.
      // VoiceOver / NVDA now announce "All Hydrants" matching what the
      // sighted user sees.
      aria-labelledby="hf-modal-heading"
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        // Backdrop click closes; panel click does not (event target check)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden border border-paper/20 bg-black shadow-[0_-12px_48px_rgba(0,0,0,0.7)]">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-paper/10 px-4 py-3">
          <h2
            id="hf-modal-heading"
            className="font-display text-lg font-extrabold uppercase tracking-wider text-paper"
          >
            All Hydrants
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center text-paper/70 transition-colors hover:text-paper focus:outline-none focus:ring-2 focus:ring-yellow"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </header>

        {/* Scrollable list */}
        <ul className="flex-1 divide-y divide-paper/10 overflow-y-auto">
          {entries.map((entry) => (
            <li
              key={entry.hydrant.id}
              data-hydrant-id={entry.hydrant.id}
              data-oos={entry.isOos ? "true" : undefined}
              className="flex items-center gap-3 px-4 py-3"
            >
              {/* Rank digit (small) */}
              <span
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center font-display text-lg font-extrabold text-paper/70"
                aria-hidden="true"
              >
                {entry.isOos ? "·" : entry.rank}
              </span>

              <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs text-paper/80">
                    {entry.hydrant.id}
                  </span>
                  {entry.isOos ? (
                    <span className="bg-red px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-paper">
                      OUT
                    </span>
                  ) : null}
                </div>
                <p className="truncate font-display text-sm leading-tight text-paper">
                  {entry.hydrant.address}
                </p>
                <p className="font-mono text-[11px] text-paper/60">
                  <span className="text-paper/80">
                    {formatDistance(entry.distanceM)}
                  </span>
                  {entry.durationS !== undefined ? (
                    <>
                      {" · "}
                      <span className="text-yellow">
                        {formatEta(entry.durationS)} ETA
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
