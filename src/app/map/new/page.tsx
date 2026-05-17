"use client";

/**
 * /map/new — New incident form.
 *
 * Flow:
 *   1. User types address → debounced (250ms) /api/geocode call
 *   2. Up to 3 results render as picker cards; selecting one fills lat/lng
 *   3. User picks TYPE + alarm + (optionally) tweaks UNIT
 *   4. FIND HYDRANTS → POST /api/incidents → navigate to /map/incident/[id]
 *
 * Visual fidelity v1: functional layout. HF-008 polish covers the marker
 * detailing on the results screen; this story is the form mechanics.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type GeocodeResult = {
  placeName: string;
  secondary: string | null;
  lat: number;
  lng: number;
};

const TYPES = ["STRUCTURE", "VEHICLE", "BRUSH", "MEDICAL", "HAZMAT", "OTHER"] as const;
type IncidentType = (typeof TYPES)[number];

export default function NewIncidentPage() {
  const router = useRouter();

  // Form state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [selected, setSelected] = useState<GeocodeResult | null>(null);
  const [type, setType] = useState<IncidentType | null>(null);
  const [alarmLevel, setAlarmLevel] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [unitId, setUnitId] = useState("E-12");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  // Debounced geocode call. The react-hooks/set-state-in-effect rule fires
  // on every setState in this effect, but the pattern is correct for a
  // debounced input: the effect doesn't directly compute derived state
  // (which is what the rule guards against); it runs an async network
  // request and surfaces the result. useDeferredValue doesn't give us
  // a debounce window, so we suppress for this block.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (query.length < 2) {
      setResults([]);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/geocode?q=${encodeURIComponent(query)}`,
          { method: "GET" },
        );
        if (res.ok) {
          const data = (await res.json()) as { results: GeocodeResult[] };
          setResults(data.results.slice(0, 3));
        } else {
          setResults([]);
        }
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const canSubmit = useMemo(
    () => Boolean(selected) && Boolean(type) && !submitting,
    [selected, type, submitting],
  );

  const handleSubmit = useCallback(async () => {
    if (!selected || !type) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: selected.placeName,
          lat: selected.lat,
          lng: selected.lng,
          type,
          alarmLevel,
          unitId,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as { id: string };
      router.push(`/map/incident/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown");
      setSubmitting(false);
    }
  }, [selected, type, alarmLevel, unitId, router]);

  // Auto-displayed time stamp
  const [now, setNow] = useState(() => formatTime(new Date()));
  useEffect(() => {
    const t = setInterval(() => setNow(formatTime(new Date())), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-black text-paper">
      {/* HEADER */}
      <header className="flex items-center gap-4 border-b border-paper/10 px-4 py-3">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="grid h-10 w-10 place-items-center border border-paper/30 font-mono text-lg"
        >
          ←
        </button>
        <h1 className="flex-1 font-display text-2xl tracking-tight">
          NEW INCIDENT
        </h1>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-paper/40">
          STEP 1/2
        </span>
      </header>

      <div className="flex-1 space-y-6 px-4 py-6">
        {/* ADDRESS */}
        <section>
          <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">
            Address
          </label>
          <div className="mt-2 flex items-center border border-yellow bg-black px-3 py-3">
            <span className="mr-2 text-yellow">⌕</span>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder="Type the incident address"
              className="flex-1 bg-transparent text-paper outline-none placeholder:text-paper/30"
              autoComplete="off"
            />
            {searching && (
              <span className="ml-2 font-mono text-[10px] text-paper/40">…</span>
            )}
          </div>
          {/* Result cards */}
          {results.length > 0 && !selected && (
            <ul className="mt-2 space-y-1">
              {results.map((r, i) => (
                <li key={`${r.lat},${r.lng}`}>
                  <button
                    data-geocode-result
                    onClick={() => {
                      setSelected(r);
                      setQuery(r.placeName);
                      setResults([]);
                    }}
                    className="flex w-full items-center gap-3 border border-paper/20 bg-black px-3 py-2 text-left hover:border-yellow"
                  >
                    <span className="text-yellow">⊙</span>
                    <span className="flex-1">
                      <span className="block">{r.placeName}</span>
                      {r.secondary && (
                        <span className="block text-sm text-paper/50">
                          {r.secondary}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-paper/40">{i + 1}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected && (
            <p className="mt-2 font-mono text-[11px] text-yellow">
              ✓ {selected.placeName}{" "}
              <button
                onClick={() => {
                  setSelected(null);
                  setQuery("");
                }}
                className="ml-2 text-paper/40 underline"
              >
                change
              </button>
            </p>
          )}
        </section>

        {/* TYPE */}
        <section>
          <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">
            Type
          </label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`border py-3 font-display text-sm tracking-tight ${
                  type === t
                    ? "border-red bg-red text-paper"
                    : "border-paper/30 text-paper/80"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        {/* ALARM */}
        <section>
          <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">
            Alarm Level
          </label>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                data-alarm-level={n}
                data-selected={alarmLevel === n ? "true" : "false"}
                onClick={() => setAlarmLevel(n as 1 | 2 | 3 | 4 | 5)}
                className={`border py-3 font-display text-lg ${
                  alarmLevel === n
                    ? "border-yellow bg-yellow text-black"
                    : "border-paper/30 text-paper/80"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        {/* META */}
        <section className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">
              Unit
            </label>
            <input
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="mt-2 w-full border border-paper/30 bg-black px-3 py-3 font-mono text-paper outline-none focus:border-yellow"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">
              Time
            </label>
            <p className="mt-2 border border-paper/10 bg-paper/5 px-3 py-3 font-mono text-paper/60">
              {now} · AUTO
            </p>
          </div>
        </section>

        {error && (
          <p className="border border-red bg-red/10 px-3 py-2 font-mono text-sm text-red">
            {error}
          </p>
        )}
      </div>

      {/* FOOTER CTA */}
      <footer className="border-t border-paper/10 bg-black px-4 py-4">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`w-full py-4 font-display text-xl tracking-tight ${
            canSubmit ? "bg-red text-paper" : "bg-paper/10 text-paper/30"
          }`}
        >
          {submitting ? "FINDING…" : "FIND HYDRANTS →"}
        </button>
      </footer>
    </main>
  );
}

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
