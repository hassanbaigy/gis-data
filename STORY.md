# HF-Foundation — Prisma + data layer

## Story
As both developers on this project, we want the data layer scaffolded with real seeded hydrant data and a clean schema before splitting story work, so that every later screen story (login, home, new incident, results, history) builds on a stable foundation and Dev B can pick up his first user-facing story without first having to design relations.

## Acceptance criteria
- `prisma/schema.prisma` defines three models — `Firefighter`, `Hydrant`, `Incident` — exactly as approved (see "Schema" below). Relations: `Firefighter` 1—N `Incident`, `Hydrant` 1—N `Incident` via `chosenHydrant` (nullable).
- Prisma migration committed at `prisma/migrations/<ts>_init/migration.sql`. `pnpm prisma migrate dev` applies cleanly to a fresh `prisma/dev.db`.
- `pnpm prisma db seed` populates:
  - **All 456 hydrants** from `/Users/hassan/Downloads/hydrants_clean.csv`, geocoded via Mapbox v6 at enrichment time (committed snapshot at `prisma/seed-data/hydrants.json`).
  - **1 firefighter**: badge `0418`, unit `E-12` (the demo account).
  - **6 incidents** spread across the last 7 days with varied `type` and `alarmLevel` (1-5 represented), located within the hydrant cluster (Gorham, ME area).
- `lib/db.ts` exports a `PrismaClient` singleton that survives HMR in dev.
- `.env.example` updated to mention `DATABASE_URL="file:./dev.db"`.
- A Playwright spec at `tests/e2e/hf-foundation.spec.ts` hits a `/api/_health/db` route and asserts: hydrant count ≥ 450 (allow a handful of geocoding failures), firefighter `0418` present, incident count = 6, every incident has a `firefighterId` matching badge `0418`.
- A failing-first ordering visible in commit history: spec commit before implementation commit.
- Confidence ≥ 0.85.
- PR opened against `develop`.

## Out of scope
- The login UI (HF-001), the map screens (HF-005, HF-008, HF-009), the geocode and nearest-hydrant API routes (HF-006, HF-007). This story ships ONLY the data layer and a health-check route.
- `requireFirefighter()` is created in `lib/auth.ts` but only stubbed — HF-001 fills in the cookie reading.
- Hydrant geocoding failures: we accept up to ~6 (1.3%) without retrying. Anything more, the geocoder needs a tweak.

## Schema (approved 2026-05-17)

```prisma
model Firefighter {
  id        String     @id @default(cuid())
  badge     String     @unique
  unitId    String     @default("E-12")
  createdAt DateTime   @default(now())
  incidents Incident[]
}

model Hydrant {
  id         String    @id            // external — "GOD-HYD00340"
  type       String                   // "Pressurized" | "Dry Hydrant" | "Unknown"
  category   String                   // "Pressurized" | "Dry"
  make       String?
  model      String?
  address    String
  location   String?
  street     String?
  city       String?
  state      String?
  zip        String?
  inService  Boolean   @default(true)
  lat        Float?
  lng        Float?
  geocodedAt DateTime?
  createdAt  DateTime  @default(now())
  chosenForIncidents Incident[] @relation("ChosenHydrant")
  @@index([inService])
  @@index([lat, lng])
}

model Incident {
  id              String       @id @default(cuid())
  createdAt       DateTime     @default(now())
  address         String
  lat             Float
  lng             Float
  type            String       // STRUCTURE | VEHICLE | BRUSH | MEDICAL | HAZMAT | OTHER
  alarmLevel      Int          // 1-5
  notes           String?
  unitId          String
  firefighter     Firefighter  @relation(fields: [firefighterId], references: [id])
  firefighterId   String
  chosenHydrant   Hydrant?     @relation("ChosenHydrant", fields: [chosenHydrantId], references: [id])
  chosenHydrantId String?
  @@index([createdAt])
  @@index([firefighterId])
  @@index([type])
}
```

## Visual reference
None. This is data-layer-only.

## Task list
1. Install Prisma 6 + tsx
2. `pnpm prisma init --datasource-provider sqlite`
3. Write `schema.prisma` with the three models
4. `pnpm prisma migrate dev --name init` → commit migration
5. Write `lib/db.ts` singleton
6. Write `scripts/enrich-hydrants.ts` (parses CSV, calls Mapbox Geocoding v6 with rate limit, writes `prisma/seed-data/hydrants.json`)
7. Run enrichment once locally → commit `prisma/seed-data/hydrants.json`
8. Write `prisma/seed.ts` (loads JSON, upserts hydrants, creates badge `0418` firefighter, creates 6 incidents)
9. Wire `package.json` `"prisma": { "seed": "tsx prisma/seed.ts" }`
10. Run `pnpm prisma db seed` → verify row counts
11. Write `app/api/_health/db/route.ts` (returns `{ hydrantCount, firefighterCount, incidentCount }`)
12. Write `tests/e2e/hf-foundation.spec.ts` against that route — FAILING FIRST
13. Make spec pass, run, score, iterate
14. Reviewer pass
15. PR to `develop`
