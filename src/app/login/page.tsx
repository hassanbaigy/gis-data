/**
 * /login — HF-001 sign-in screen.
 *
 * Server component shell. The brand block (logo + wordmark + subtitle) is
 * static and rendered server-side; the form is a separate `'use client'`
 * child component because the PIN-cell focus state machine needs React
 * state.
 *
 * Per decision D4, this route renders the form REGARDLESS of whether an
 * `hf_badge` cookie is already present. Two firefighters may share a
 * device; submitting a new 4+4 overwrites the cookie. We deliberately do
 * NOT call `requireBadge()` here.
 */

import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-paper">
      <div className="w-full max-w-sm">
        {/* Brand block — 56px red square + flame glyph, wordmark, subtitle */}
        <div className="mb-10 flex flex-col items-center text-center">
          <div
            className="flex h-14 w-14 items-center justify-center bg-red text-paper"
            aria-hidden="true"
          >
            {/* Flame glyph (Heroicons fire). Decorative — aria-hidden via parent. */}
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-7 w-7"
              aria-hidden="true"
            >
              <path d="M12.7 1.5a.75.75 0 0 0-1.43.07c-.93 4-3.04 5.32-4.85 7.05A8.25 8.25 0 0 0 4 14.5a8.25 8.25 0 0 0 16.5 0c0-2.6-1.2-4.93-3.06-6.46a8.94 8.94 0 0 1-1.92-2.83 12.83 12.83 0 0 0-2.82-3.71Zm-.45 13.74a.75.75 0 0 1 .79-.74 4.5 4.5 0 0 1 4.2 4.2.75.75 0 0 1-1.5.05 3 3 0 0 0-2.78-2.78.75.75 0 0 1-.7-.73Z" />
            </svg>
          </div>
          <h1 className="mt-5 font-display text-3xl font-extrabold uppercase tracking-tight text-paper">
            HYDRANT FINDER
          </h1>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-paper/40">
            FDNY · v0.1 PROTO
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
