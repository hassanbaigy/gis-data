/**
 * HintCard (HF-005) — dark bottom hint card on /map home. Shows the
 * most-recent incident at a glance. No glass blur (per spec card 2 —
 * "glassless dark"). Display-only.
 *
 * The hydrant count chip is derived from `chosenHydrantId` presence across
 * the visible incident list (per STORY.md AC: "N hydrants derived from
 * chosenHydrantId presence"). Computed in `MapHome` and passed in — keeps
 * this component a pure render of two facts: the most-recent incident's
 * address + time, and the count of incidents in view that had a hydrant
 * assigned.
 *
 * Reviewer BLOCKER-2 (pre-merge): the previous version rendered a
 * hardcoded "3 hydrants nearby" regardless of data. That was a factual
 * lie when fewer (or more) incidents had chosen hydrants. Fixed by
 * passing `hydrantCount` from the parent.
 */

type IncidentLike = {
  address: string;
  createdAt: string; // ISO string
  chosenHydrantId: string | null;
};

type Props = {
  incident: IncidentLike | null;
  /** Count of incidents in the currently-visible list whose `chosenHydrantId` is non-null. */
  hydrantCount: number;
};

export function HintCard({ incident, hydrantCount }: Props) {
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
  const hydrantLabel =
    hydrantCount === 1 ? "1 hydrant" : `${hydrantCount} hydrants`;

  return (
    <div className="rounded-md bg-black/80 p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/40">
        LAST INCIDENT · {hoursLabel}
      </p>
      <p className="mt-1 font-display text-lg leading-tight text-paper">
        {incident.address}
      </p>
      <p className="mt-2 inline-block bg-paper/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-paper/70">
        {hydrantLabel}
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
