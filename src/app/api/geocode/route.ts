/**
 * GET /api/geocode?q=<address>
 *
 * Server-side proxy to Mapbox Geocoding v6 forward-search. Caps at 5 results
 * and returns a minimal shape so the client never sees the access token,
 * the proximity bias parameters, or any other internal request shape.
 *
 * Caller pattern (HF-006 /map/new):
 *   1. User types in the address field
 *   2. UI debounces 250ms and calls /api/geocode?q=<text>
 *   3. Top 3 results render as picker cards
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// TODO(HF-001-merge): gate with requireFirefighter() once auth lands.

const GORHAM_PROXIMITY = "-70.4444,43.6791"; // bias toward the seed area

// Same scrubber pattern as src/lib/mapbox.ts — defence-in-depth.
function scrubTokens(s: string): string {
  return s.replace(/[sp]k\.[A-Za-z0-9._-]+/g, "[REDACTED]");
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const token = process.env.MAPBOX_SECRET_TOKEN ?? "";
  if (!token) {
    return NextResponse.json(
      { error: "MAPBOX_SECRET_TOKEN is not set" },
      { status: 500 },
    );
  }

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "5");
  url.searchParams.set("country", "us");
  url.searchParams.set("proximity", GORHAM_PROXIMITY);
  url.searchParams.set("access_token", token);

  // Mapbox REST APIs reject `Authorization: Bearer` auth (verified 401
  // against Geocoding v6, Directions v5, Matrix v1). Token must be a
  // query param. scrubTokens below handles the response-leak path.
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      {
        error: "geocode-failed",
        upstreamStatus: res.status,
        message: scrubTokens(body.slice(0, 200)),
      },
      { status: 502 },
    );
  }

  type Feature = {
    properties?: {
      name?: string;
      place_formatted?: string;
      full_address?: string;
    };
    geometry?: { coordinates?: [number, number] };
  };
  const data = (await res.json()) as { features?: Feature[] };

  const results = (data.features ?? [])
    .filter((f) => f.geometry?.coordinates)
    .slice(0, 5)
    .map((f) => {
      const [lng, lat] = f.geometry!.coordinates!;
      return {
        placeName: f.properties?.full_address ?? f.properties?.name ?? "",
        secondary: f.properties?.place_formatted ?? null,
        lat,
        lng,
      };
    });

  return NextResponse.json({ results });
}
