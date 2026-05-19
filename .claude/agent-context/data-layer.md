# Data layer — Prisma, schema, seed

Notes future agents need to know about the Hydrant Finder data layer. Updated as of HF-Foundation merge.

## Models (current as of `prisma/schema.prisma` on develop)

- **`Firefighter`** — the only user persona. `badge` (unique 4-digit string) is the login identity. `unitId` defaults to `"E-12"`. 1—N to `Incident`.
- **`Hydrant`** — `id` is the external CSV id (e.g. `GOD-HYD00340`). `type` is `"Pressurized" | "Dry Hydrant" | "Unknown"`. `category` is `"Pressurized" | "Dry"`. `lat`/`lng`/`geocodedAt` may be null (treat null as "unknown location, do not show on map"). Index on `inService` and `(lat, lng)`.
- **`Incident`** — `firefighter` FK is REQUIRED, `chosenHydrant` FK is OPTIONAL (SET NULL on hydrant delete). `type` is one of `STRUCTURE | VEHICLE | BRUSH | MEDICAL | HAZMAT | OTHER` (free-form string in the DB; future story may convert to enum).

## DB lives at `prisma/dev.db`
- Gitignored. Recreate via `pnpm prisma migrate dev` then `pnpm prisma db seed`.
- `DATABASE_URL` is read from `.env` (committed, non-secret default `file:./dev.db`). Override locally in `.env.local` if you need a separate DB.
- Schema uses `env("DATABASE_URL")` — never hardcode the URL in `schema.prisma`. Postgres swap is a one-line datasource change.

## Seed quirks
- `prisma/seed.ts` upserts hydrants + firefighter (idempotent). For incidents it does `deleteMany({ where: { firefighterId: ff.id } })` then re-creates — this preserves any other firefighters' incidents across reseeds.
- The 6 sample incidents are real coordinates around Gorham, ME, with varied `type` (5 distinct values) and `alarmLevel` (1-5 represented). All link to badge `0418`.

## Geocoding (Mapbox v6) — gotchas worth knowing

- **Address normalization is critical for partial municipal data.** The Gorham CSV had bare street names like `"Julia DR"`. Sending them to Mapbox raw produced 29% no-match. Appending `", Gorham, ME 04038"` when no city marker is present took success to 100%. Code: `scripts/enrich-hydrants.ts` `normalizeForGeocode()`.
- **Always filter outliers post-hoc.** Even with proximity bias, Mapbox sometimes matches a same-named street in a different town. Drop anything > 50km from the dataset's centroid (haversine). HF-Foundation found 2 outliers (out of 456) doing exactly this — Mapbox matched `"Libby Ave"` in central Maine.
- **Confidence tiers**: Mapbox v6 returns `match_code.confidence` of `exact | high | medium | low`. For a prototype, accepting `low` is fine since the result still falls within the right town — flag it in `geocodeNote` for downstream stories that may want to dedupe centroid-snapped clusters (we have ~132 of these from the initial enrichment).
- **Rate limit**: free tier is ~600 req/min on Geocoding v6. The enrichment script sleeps 150ms between calls (~400 req/min) for headroom. 456 rows ≈ 80s.

## Diagnostic route — `/api/health/db`

Returns:
```json
{
  "firefighterCount": 1,
  "hydrantCount": 456,
  "hydrantGeocodedCount": 454,
  "incidentCount": 6,
  "incidentsByType": { "STRUCTURE": 2, "VEHICLE": 1, "BRUSH": 1, "MEDICAL": 1, "HAZMAT": 1 },
  "incidentOwnerBadges": ["0418"]
}
```

Internal-only. A future story may remove it once real query routes exist. The Foundation Playwright spec hits it; nothing else should depend on it.

## Don't underscore-prefix route folders

`app/api/_health/db/route.ts` is NOT routable — Next.js App Router excludes `_underscore`-prefixed folders as private. Use `app/api/health/db/route.ts` instead. Already captured in `scaffold-state.md`.

## File layout

- `src/lib/db.ts` — Prisma client singleton (`globalThis`-pinned to survive HMR). Import as `@/lib/db`.
- `prisma/schema.prisma` — single source of truth.
- `prisma/seed-data/hydrants.json` — committed pre-geocoded snapshot. Regenerate with `pnpm tsx scripts/enrich-hydrants.ts` (needs `MAPBOX_SECRET_TOKEN` in `.env.local`).
- `scripts/enrich-hydrants.ts` — one-time enrichment. Path to source CSV is hardcoded; pass `--csv` if it ever needs to be parameterised.
