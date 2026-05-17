/**
 * Bootstrap home page — replaced when HF-001 (login) and HF-005 (map) land.
 * For now it proves the design tokens and fonts are wired by rendering the
 * HYDRANT FINDER wordmark on the canonical black canvas.
 */
export default function Home() {
  const isDev = process.env.NODE_ENV === "development";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-paper">
      {isDev ? (
        <span className="mb-4 inline-block bg-yellow px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-black">
          HF-000 · Bootstrap Placeholder
        </span>
      ) : null}
      <h1
        className="text-center font-display text-[88px] font-extrabold leading-[0.88] tracking-tight"
        style={{ letterSpacing: "-0.02em" }}
      >
        HYDRANT
        <br />
        FINDER<span className="text-yellow">.</span>
      </h1>
      <p className="mt-6 max-w-xl text-center text-sm leading-relaxed text-paper/70 font-ui">
        Field hydrant finder for fire crews. Prototype scaffold — drop in the
        login screen (HF-001) to begin the real flow.
      </p>
      <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.16em] text-paper/40">
        FDNY · v0.1 PROTO
      </p>
    </main>
  );
}
