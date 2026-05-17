# HF-007 — POST /api/hydrants/nearest

## Story
As the incident-results screen, I need an endpoint that, given a lat/lng, returns the 3 in-service hydrants nearest by routed driving duration plus the route geometry for #1, so that I can show the firefighter a ranked list and a drawn route.

## Acceptance criteria (from `.claude/agent-context/user-stories.md` lines 212-225)

- `POST /api/hydrants/nearest` accepts `{ lat: number, lng: number, k?: number }` (default `k=3`). Returns **400** on missing or invalid coordinates.
- Algorithm exactly per `prompt.html` §06:
  1. Filter `Hydrant` rows to `inService === true AND lat IS NOT NULL AND lng IS NOT NULL`.
  2. Sort by haversine distance from the candidate point.
  3. Take the closest **10**.
  4. Call Mapbox Directions Matrix (`/directions-matrix/v1/mapbox/driving`) with the candidate as `source`, those 10 as `destinations`. Request `annotations=duration,distance`.
  5. Sort the 10 by routed `duration` (ascending). Return top `k` (default 3).
  6. Also return the next **2 out-of-service candidates** within the haversine search radius as `flaggedOos` — haversine distance only, no Matrix call.
- For the **#1** result only, fetch the full route geometry via `GET /directions/v5/mapbox/driving/{src};{dst}?geometries=geojson&overview=full`. Top 2 and 3 carry only distance + duration. `flaggedOos` carries only haversine distance.
- Response shape:
  ```json
  {
    "nearest": [
      { "hydrant": {/* Hydrant row */}, "distanceM": 55, "durationS": 42, "geometry": { /* LineString */ } },
      { "hydrant": {...}, "distanceM": 80, "durationS": 60 },
      { "hydrant": {...}, "distanceM": 120, "durationS": 90 }
    ],
    "flaggedOos": [
      { "hydrant": {...}, "distanceM": 125 },
      { "hydrant": {...}, "distanceM": 150 }
    ]
  }
  ```
- `MAPBOX_SECRET_TOKEN` is read **server-side only** — never appears in any response payload or client-bound code.
- If the Matrix call fails: respond with **502** carrying `{ error: "matrix-failed", upstreamStatus, message }`. No silent fallback.
- If the Directions v5 call fails for #1: return top 3 ranked by haversine instead, with `degraded: true` flag so the UI can render without the polyline. Compromise so the whole request doesn't fail because of a geometry call.

## Test plan
- `src/lib/geo.ts` — pure haversine function. Unit-test with known fixtures (NYC↔LA, antipodal, same-point=0).
- `src/lib/mapbox.ts` — `getMatrix(source, destinations)` and `getRoute(source, destination)`. Unit-test mocked-fetch (URL shape, headers, error mapping).
- `src/app/api/hydrants/nearest/route.ts` — integration spec hits the live endpoint with the seeded data layer. Mapbox calls go out for real — the seed concentrates hydrants in Gorham, ME, so calls are cheap.
- Failing-first: integration spec is committed before the route handler exists.

## Out of scope
- The UI consuming this (HF-008)
- Incident persistence (HF-006 will call this endpoint)
- Caching the Matrix response (YAGNI for prototype)
- Anything in `prisma/`, `src/components/`, `src/app/login/*`, `src/app/api/auth/*`, `src/app/api/health/db/*`

## Files this story owns
- `src/lib/geo.ts`
- `src/lib/mapbox.ts`
- `src/app/api/hydrants/nearest/route.ts`
- `tests/unit/geo.test.ts`
- `tests/unit/mapbox.test.ts`
- `tests/e2e/hf-007-nearest-api.spec.ts`
- `STORY.md`, `.claude-resume.md`

## Dependencies added
- `vitest@^3` + `vitest.config.ts` — unit test runner (Playwright doesn't cover unit cases). New `test:unit` script.

## Task list
1. Add `vitest@^3`; minimal `vitest.config.ts`; wire `test:unit` script. Confirm harness boots.
2. Write failing-first integration spec at `tests/e2e/hf-007-nearest-api.spec.ts`. Commit (TDD step 3).
3. Implement `src/lib/geo.ts` + unit test.
4. Implement `src/lib/mapbox.ts` + unit tests (mocked fetch).
5. Implement the route handler. Read in-service+geocoded hydrants via Prisma, haversine pre-sort, top-10, Matrix call, duration sort, Directions for #1, flaggedOos from OOS rows.
6. Run integration spec; should pass.
7. Score against rubric (no Visual/A11y — reweight onto Functional + Robustness + Console).
8. Reviewer + security-auditor in parallel (security pass because the secret token touches this surface).
9. PR to `develop`.

## Confidence gate
≥ 0.85. Functional + Robustness weighted heavily — this is the algorithmic core.

## Performance notes
- 454 geocoded hydrants. Haversine sort is microsecond-fast.
- One Matrix call (1×10 = 10 elements) + one Directions call per request. Expected ~600-900ms end-to-end.
- No caching. Real production would key by `(roundedIncidentCoord, hydrantSetVersion)` — defer.
