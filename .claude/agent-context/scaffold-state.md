# Scaffold state (Next.js 16 + Tailwind v4)

Current as of 2026-05-17. Verify before assuming.

## What's installed
- Next.js **16.2.6** (App Router) — verify in `package.json`. The AGENTS.md "this is NOT the Next.js you know" rule applies: read `node_modules/next/dist/docs/` before non-trivial Next.js work.
- React **19.2.4**
- Tailwind CSS **v4** via `@tailwindcss/postcss` (see `postcss.config.mjs` lines 1-7). **NO `tailwind.config.ts`** in this repo — theme tokens live in `src/app/globals.css` via the `@theme inline { ... }` directive.
- TypeScript 5

## File layout that surprises agents
- App code is under `src/` (path alias `@/*` → `./src/*` in `tsconfig.json`). The default Next.js convention puts `app/` at the root; this repo's was scaffolded with `--src-dir`.
- `src/app/layout.tsx` and `src/app/page.tsx` are the current scaffold defaults (Geist fonts, Create Next App boilerplate) until HF-000 replaces them.
- `src/app/globals.css` uses Tailwind v4 syntax: `@import "tailwindcss"` + `@theme inline { ... }`. NOT `@tailwind base; @tailwind components; @tailwind utilities;` (that's v3).

## Registering theme tokens (Tailwind v4)
v4 reads tokens from CSS, not a config file. Pattern:

```css
@theme inline {
  --color-black:  #0a0a0a;
  --color-red:    #E11D29;
  --color-yellow: #FCD34D;
  --color-paper:  #f4f2eb;
  --font-display: var(--font-barlow-condensed);
  --font-ui:      var(--font-inter);
  --font-mono:    var(--font-jetbrains-mono);
}
```

Tailwind utilities then resolve `bg-black` → `#0a0a0a`, `font-display` → Barlow Condensed, etc. NEVER add a `tailwind.config.ts` — it conflicts with the v4 PostCSS plugin.

## next/font in Next 16
Confirmed via `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md` lines 743-771. To expose a font as a CSS variable for Tailwind v4 `@theme`:

```ts
import { Inter } from "next/font/google";
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",   // key — exposes the CSS var
});
// then in <html className={inter.variable}>
```

Multiple fonts: each gets its own `variable`, all applied to `<html className={`${a.variable} ${b.variable} ${c.variable}`}>`.

## Acceptance-criteria adjustment that this implies
The HF-000 AC originally said "`tailwind.config.ts` exports …" — that's v3 thinking. In this repo, register tokens in `src/app/globals.css` `@theme` block instead. Story map has been updated.

## Next.js App Router routing surprises

- **Underscore-prefixed folders are private** and excluded from routing. `app/api/_health/db/route.ts` is NOT routable — you'll get a 404. Use `app/api/health/db/route.ts` instead. Reference: Next.js App Router folder conventions.
- **Parens-wrapped folders are route groups** (`app/(marketing)/about/page.tsx` → `/about`). Useful for layout grouping without affecting URL.
- **Square-bracket folders are dynamic** (`[id]`, `[...slug]`, `[[...slug]]`).

## Prisma + Next 16 (HF-Foundation, 2026-05-17)

- Prisma 6.19 works fine with Next 16.2.6. Prisma 7 is available but the `prisma-client` generator (new in 7) is still settling; stay on `prisma-client-js` + Prisma 6 unless you have a reason.
- pnpm v10 blocks build scripts by default. Prisma needs them to download the engine binary. Add this to `package.json` (already in place):
  ```json
  "pnpm": {
    "onlyBuiltDependencies": ["@prisma/client", "@prisma/engines", "prisma", "esbuild", "@tailwindcss/oxide"]
  }
  ```
- `prisma migrate dev` runs the `prisma.seed` command at the end. If `prisma/seed.ts` doesn't exist yet, the migrate command fails AFTER applying the migration. The schema/migration is still saved — just rerun seed once the file exists.
- DB file location: `prisma/dev.db`. Gitignore `prisma/*.db` and `prisma/*.db-journal`. The `prisma/migrations/` folder IS committed.
- `lib/db.ts` lives under `src/lib/db.ts` so the `@/*` → `./src/*` path alias resolves. Import as `@/lib/db`.

## Next 16 cookies + redirect (HF-001, 2026-05-17 — verified against node_modules/next/dist/docs)

- **`cookies()` is async** in Next 15+. Source: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` lines 6, 67-68. Always `const cookieStore = await cookies()` — calling it synchronously returns a Promise object, not the cookie store, and every `.get/.has/.set` silently no-ops. The synchronous form is deprecated and slated to be removed.
- **`cookies().set` only works in Route Handlers / Server Functions**, not in Server Component renders (HTTP doesn't allow cookies after streaming starts). Pattern in this repo: read-only `cookies()` in `src/app/page.tsx`, write `cookies().set` in `src/app/api/auth/sign-in/route.ts`.
- **`redirect()` throws `NEXT_REDIRECT` internally**. Source: `redirect.md` lines 50-52. Call it OUTSIDE any `try/catch` — wrapping a redirect in a try swallows the throw and the redirect silently fails. The function returns `never` so no `return redirect(...)` needed.
- **`redirect()` cannot be called in Client Component event handlers.** Source: `redirect.md` line 53. For form submissions on `'use client'` pages, use `useRouter().push('/...')` instead. `redirect()` is OK in client component RENDER (initial SSR path), just not in `onClick`/`onSubmit`.
- **Cookie `Secure: true` on `http://localhost`** is silently rejected by Chrome/Firefox — the browser drops the Set-Cookie without an error log. In dev (`NODE_ENV !== 'production'`), pass `secure: false`. Pattern in `src/lib/auth.ts` `hfBadgeCookieOptions()`: `secure: process.env.NODE_ENV === 'production'`.

## Playwright + this app (HF-001, 2026-05-17)

- **`webServer.url` in `playwright.config.ts` must probe a stable-200 route**, not one that redirects. The original config probed `/`, which after HF-001's root-redirect gate becomes 307 → 404 (until every redirect target exists). Playwright follows the redirect and treats the 404 as "not ready", then tries to spawn a duplicate dev server which collides on port 3000. The repo uses `http://localhost:3000/api/health/db` as the probe — independent of auth state, always 200 if the DB is up.
- **`httpOnly` cookies cannot be read from `document.cookie`**. To verify cookie state in Playwright tests, use `await page.context().cookies()` and inspect the returned objects' `name`, `value`, `httpOnly`, `sameSite`, `path`, `secure`, `expires` fields.
- **`page.waitForNavigation()` is deprecated** in Playwright 1.5x+. Use `await page.waitForURL(/regex|glob/)` instead.
- **Console-error guard pattern**: collect `page.on("console", msg => msg.type() === "error")` in `beforeEach`, assert empty in `afterEach`. When a story intentionally lands on a route that doesn't exist yet (e.g. `/map` until HF-005 ships), filter the specific `"Failed to load resource ... 404"` message from the guard, scoped by `page.url()` so unrelated 404s still fail the test.
