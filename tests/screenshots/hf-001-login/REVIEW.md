# HF-001 review — mock auth + /login screen

**Confidence: 0.94 — above 0.85 gate. Ready for review + PR.**

Self-rated 2026-05-17 after iteration 1 (subtitle case fix bumped Visual from 0.85 → 0.95).

## Score by dimension

| Dimension | Weight | Score | Weighted | Notes |
|---|---|---|---|---|
| Functional | 0.30 | 1.00 | 0.300 | 6/6 HF-001 Playwright tests pass. 10/10 across the full e2e suite (HF-000 smoke 3, HF-Foundation 1, HF-001 6). No `.skip`, no `.only`. |
| Visual | 0.25 | 0.95 | 0.238 | Brand block, flame glyph, wordmark, subtitle, badge input, PIN pad, CTA shadow, disabled state — all match `prompt.html` §07 spec card 1. Subtitle case fixed (lowercase `v0.1` matches spec). PIN cell border uses `border-paper/20` for inactive cells; active cell switches to `border-yellow`. Small deduction since no side-by-side comparison against a rendered mock screenshot. |
| Interaction | 0.15 | 0.95 | 0.143 | PIN cells auto-advance on digit input; Backspace on empty cell jumps to previous; Arrow keys navigate. Badge input accepts only digits up to 4. Tab order: badge → 4 PIN cells → SIGN IN. Active cell border turns yellow on focus (verified in code; screenshots are post-interaction so they don't always capture focus state). |
| Robustness | 0.15 | 0.80 | 0.120 | Empty, partial-badge, partial-PIN, valid-4+4 states all handled. POST error surfaces a `role="alert"` message under the form. Loading state uses opacity-50 (same visual as disabled) — no spinner; acceptable for prototype. No automatic retry on network failure. |
| A11y | 0.10 | 0.90 | 0.090 | Labels: `htmlFor` + `aria-label` on badge; `aria-label="PIN digit N"` on each PIN cell; `role="group" aria-label="PIN code"` on the cell container; `role="alert"` on errors; `aria-hidden` on decorative flame icon. Visible focus indicator via border-colour change (border-paper/20 → border-yellow). Did NOT run `@axe-core/playwright` — deferred; can be added in a follow-up story. |
| Console | 0.05 | 1.00 | 0.050 | No unexpected `error`-level browser console messages. The known `/map` 404 (HF-005 hasn't shipped) is filtered explicitly in the `afterEach` guard, scoped by `page.url()` so unrelated 404s still fail. |

**Total: 0.300 + 0.238 + 0.143 + 0.120 + 0.090 + 0.050 = 0.941**

## What matches the visual reference

- **Brand block** — 56px red (`#E11D29`) square + white flame glyph, centred above the wordmark
- **Wordmark** — "HYDRANT FINDER" in Barlow Condensed ExtraBold (`font-display`)
- **Subtitle** — "FDNY · v0.1 PROTO" in JetBrains Mono (`font-mono`) at `text-paper/40` (fog)
- **Badge input** — single text input, mono `text-[22px]`, tracking-[0.4em] for digit separation, faint "0000" placeholder
- **PIN pad** — 4 separate `h-14 w-14` cells with conditional border (yellow when active)
- **SIGN IN CTA** — red background, "SIGN IN →", shadow `0 8px 32px rgba(225,29,41,0.35)` (visible red glow below the button)
- **Disabled state** — opacity-50 + `aria-disabled="true"`; click is a no-op (handler returns early)
- **Layout** — centred single column, `px-6` (24px gutters), `max-w-sm` (≈384px) on a black canvas

## What deviates (intentional or acceptable)

- The 4 PIN cells are 56×56px (`h-14 w-14`). The visual spec doesn't pin a size; matches the brand-block square size for rhythm.
- Cell borders are subtle (`border-paper/20`) on the dark canvas — visible but quiet. Matches the "muted border" intent.
- The disabled CTA in the empty state reads as muted (correct per AC) — could be read as "ready but waiting" by a first-time user. Per the brief, this is the spec.
- Tailwind v4 arbitrary values (`text-[22px]`, `shadow-[0_8px_32px_rgba(...)]`) used directly rather than added as theme tokens — single-use values, not worth promoting.

## Console-error guard exception

The `afterEach` filter allows one specific message — `Failed to load resource ... 404` — only when `page.url().includes('/map')`. This is the deliberate prototype-gap behaviour: `/map` 404s until HF-005 ships. The filter is scoped tightly so unrelated 404s still fail the test.

## What's not covered in this story (out of scope, deferred)

- Real authentication, password hashing, brute-force protection — explicitly out of scope per the brief
- Account creation / registration flow
- The `/map` screen itself (HF-005)
- Sign-out route (`/api/auth/sign-out` — added optionally if test teardown needs it; tests pass without it via `context.clearCookies()`)
- CSRF protection (prototype scope; security-auditor will flag for awareness)
- `@axe-core/playwright` automated a11y scan (would close the small A11y gap from 0.90 → 1.00)

## Iteration log

- **Iteration 0** — initial pass scored ~0.91 with one deviation: subtitle rendered "FDNY · V0.1 PROTO" because of an `uppercase` Tailwind class. Spec calls for lowercase `v0.1`.
- **Iteration 1** — removed `uppercase` from subtitle; subtitle now renders "FDNY · v0.1 PROTO" matching spec exactly. All 6 tests still pass. Visual: 0.85 → 0.95. **Final: 0.94.**

## Ready for

- `reviewer` agent — full diff review (correctness, architecture, readability, test coverage)
- `security-auditor` agent in parallel — auth + cookie diff: cookie flags, CSRF posture, PIN not logged or stored
- After both sign-off: `gh pr create --base develop --title "feat(hf-001): mock auth + /login screen"`
