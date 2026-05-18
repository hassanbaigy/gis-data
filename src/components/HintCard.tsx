/**
 * HintCard (HF-005) — dark bottom hint card on /map home. Shows the
 * most-recent incident at a glance. No glass blur (per spec card 2 —
 * "glassless dark"). Display-only.
 *
 * The "N hydrants" chip is intentionally static at "3 hydrants nearby" —
 * `/api/hydrants/nearest` always returns top-3 by design, so this is
 * honest to the algorithm's contract even though we don't recompute here.
 * HF-008 will surface per-incident hydrant detail on the results screen.
 */

type IncidentLike = {
  address: string;
  createdAt: string; // ISO string
  chosenHydrantId: string | null;
};

type Props = {
  incident: IncidentLike | null;
};

export function HintCard({ incident }: Props) {
  if (!incident) {
    return (
      <div className="rounded-md bg-black/80 p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/40">
          No incidents
        </p>
        <p className="mt-1 font-display text-lg text-paper">
          In the selected time window
        </p>
      </div>
    );
  }

  const hoursAgo = hoursSince(incident.createdAt);
  const hoursLabel = hoursAgo === 1 ? "1 HR AGO" : `${hoursAgo} HRS AGO`;

  return (
    <div className="rounded-md bg-black/80 p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/40">
        LAST INCIDENT · {hoursLabel}
      </p>
      <p className="mt-1 font-display text-lg leading-tight text-paper">
        {incident.address}
      </p>
      <p className="mt-2 inline-block bg-paper/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-paper/70">
        3 hydrants nearby
      </p>
    </div>
  );
}

function hoursSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  const ms = Date.now() - then;
  return Math.max(0, Math.floor(ms / 3_600_000));
}
