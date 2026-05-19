"use client";

/**
 * SOS button (HF-005) — visible stub. Per STORY.md decision D2: aria-label
 * "SOS — not yet active", onClick logs to console only. Real SOS dispatch
 * is a future story.
 */
export function SosButton() {
  return (
    <button
      type="button"
      aria-label="SOS — not yet active"
      onClick={() => console.log("[SOS] pressed — not yet implemented")}
      className="flex h-12 w-12 items-center justify-center border-2 border-yellow bg-black/80 text-yellow backdrop-blur-sm transition-colors hover:bg-yellow/10 focus:outline-none focus:ring-2 focus:ring-yellow"
    >
      <span className="font-display text-sm font-extrabold tracking-wider">SOS</span>
    </button>
  );
}
