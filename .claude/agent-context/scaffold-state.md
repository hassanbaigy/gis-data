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
