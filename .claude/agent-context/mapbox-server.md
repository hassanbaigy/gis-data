# Mapbox server-side helpers (Directions, Matrix, Geocoding)

Captured during HF-007. Read before adding a new Mapbox-using server route, or before changing `src/lib/mapbox.ts`.

## Token rules

- Server-side calls (Directions, Matrix, Geocoding) use `MAPBOX_SECRET_TOKEN` from `.env.local` (gitignored). NEVER `NEXT_PUBLIC_MAPBOX_TOKEN` for server work.
- Client-side calls (Mapbox GL JS in MapView) use `NEXT_PUBLIC_MAPBOX_TOKEN` — that's exposed-by-design.
- The `lib/mapbox.ts` module reads `MAPBOX_SECRET_TOKEN` lazily inside the helper functions (not at import time). This makes the unit tests easier (set env vars per test) and avoids accidental import-time crashes if the env is missing in some context.
- **Never include the token in a response payload**, even for debugging. The HF-007 spec has belt-and-braces assertions that `sk.` and `MAPBOX_SECRET_TOKEN` don't appear in the JSON. Copy that pattern for any new Mapbox-touching route.

## Coordinate ordering — `lng,lat` not `lat,lng`

Every Mapbox URL takes coordinates in `lng,lat` order. The repo's own `Coord` type is `{ lat, lng }` (in alphabetical order for readability), so the helpers do the flip:

```ts
function coordsParam(coords: Coord[]): string {
  return coords.map((c) => `${c.lng},${c.lat}`).join(";");
}
```

If you ever see results "near the equator off the coast of Africa," you flipped the order somewhere. Almost every Mapbox bug looks like this once.

## Matrix vs Directions — different pipelines, different numbers

`getMatrix()` and `getRoute()` can return different `distance` and `duration` values for the same A→B pair. The Matrix is optimised for bulk batches; Directions v5 uses the full per-pair routing engine.

**The HF-007 algorithm explicitly uses Matrix-derived values for ranking the top-3 and Directions-v5 ONLY for fetching the #1 geometry**. Don't overwrite Matrix metrics with Directions metrics or you break the monotonic ordering of `nearest[*].durationS`. We learned this the hard way — the integration spec caught it.

## Response shape verification — `code === "Ok"`

Both Matrix and Directions v5 wrap success/failure with a top-level `code` field. The success code is the literal string `"Ok"` (capital O). On failure it's something like `"NoRoute"`, `"NoSegment"`, or `"InvalidInput"`. Always check `code === "Ok"` AND verify the data arrays are non-empty before reading them.

```ts
if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
  throw new MapboxError(502, `Directions returned unexpected shape: code=${data.code}`);
}
```

## Error mapping — surface upstream status to the API caller

The repo's pattern is to throw a typed `MapboxError(upstreamStatus, message)` from the helpers, then map to a 502 in the route handler with the upstream status carried through in the body:

```ts
return NextResponse.json(
  {
    error: "matrix-failed",
    upstreamStatus: err instanceof MapboxError ? err.upstreamStatus : 0,
    message: err instanceof Error ? err.message : "unknown",
  },
  { status: 502 },
);
```

This way the consuming UI can distinguish "rate-limited" (429) from "invalid input" (422) from "Mapbox is down" (5xx) — useful for retry logic later.

## Degraded responses for partial failures

HF-007 implements a "degraded" pattern: if Matrix succeeds but Directions v5 fails, return the ranked list with `degraded: true` and no geometry. The UI shows cards without the route polyline rather than failing the whole request. Per the brief's "no silent fallback" rule, the flag is explicit so the caller can act on it.

If you add another Mapbox-touching route, consider what failure modes are recoverable vs. fatal and which deserve the `degraded` flag.

## Matrix limits

- Free / standard tier: 25 elements per request (1 source × 25 destinations OR 5×5 sources×destinations). HF-007 uses 1×10 = 10 elements, well within limits.
- If a future story needs more than 25, batch into multiple Matrix calls and merge.

## Testing pattern — mock fetch for unit tests, real fetch for integration

`tests/unit/mapbox.test.ts` mocks `global.fetch` per test and asserts URL shape, headers, and error mapping. `tests/e2e/hf-007-nearest-api.spec.ts` calls the real endpoint with the real Mapbox API — that's how we know the URL construction works end-to-end. Use both layers.
