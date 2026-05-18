/**
 * BadgePlate (HF-005) — top-left mono badge label on the /map home.
 * Display-only; no interactive behaviour.
 */
export function BadgePlate({ badge }: { badge: string }) {
  return (
    <div
      className="rounded-sm bg-black/80 px-3 py-2 font-mono text-sm text-paper backdrop-blur-sm"
      aria-label={`Signed in as badge ${badge}`}
    >
      BADGE {badge}
    </div>
  );
}
