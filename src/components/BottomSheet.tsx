/**
 * BottomSheet (HF-008) — generic sheet container fixed to the bottom of
 * its positioned parent. Carries a visual drag-handle pill at the top.
 *
 * Per STORY.md decision D1, the drag handle is a visual affordance only
 * in v1 — there's no touch handler, no collapsed state, no peek mode.
 * The sheet is always fully open. Real drag-to-collapse interaction is
 * deferred to a future story.
 *
 * Layout contract: parent must be `position: relative` (or absolute).
 * The sheet uses `absolute inset-x-0 bottom-0 z-10`, so it overlays
 * whatever else sits at the bottom of the parent.
 */

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Optional override classes appended to the wrapper. */
  className?: string;
  /** Optional aria-label for the section (defaults to "Results"). */
  ariaLabel?: string;
};

export function BottomSheet({ children, className, ariaLabel }: Props) {
  return (
    <section
      aria-label={ariaLabel ?? "Results"}
      className={[
        "absolute inset-x-0 bottom-0 z-10 rounded-t-xl bg-black/95 backdrop-blur-sm",
        "shadow-[0_-12px_32px_rgba(0,0,0,0.55)]",
        className ?? "",
      ].join(" ")}
    >
      {/* Drag handle — visual only (D1). aria-hidden because it's not interactive. */}
      <div className="flex justify-center pt-3 pb-1" aria-hidden="true">
        <div className="h-1 w-12 rounded-full bg-paper/30" />
      </div>
      {children}
    </section>
  );
}
