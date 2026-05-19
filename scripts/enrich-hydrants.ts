/**
 * One-time hydrant enrichment script.
 *
 * Reads the source CSV, parses each row into a Hydrant shape, calls
 * Mapbox Geocoding v6 to attach lat/lng, and writes the result to
 * prisma/seed-data/hydrants.json (committed). The seed script reads
 * that JSON — Dev B never runs this enrichment.
 *
 * Run with: `pnpm tsx scripts/enrich-hydrants.ts`
 *
 * Requires:
 *  - MAPBOX_SECRET_TOKEN in .env.local (or .env)
 *  - The CSV at /Users/hassan/Downloads/hydrants_clean.csv
 *
 * Rate limit: Mapbox free tier permits ~600 requests/minute on Geocoding v6.
 * We sleep 150ms between calls (~400 req/min) for headroom. 456 rows ≈ 70s.
 *
 * Failures: if a row's address geocodes to nothing or returns < 0.5
 * confidence, lat/lng stay null. The seed loads it anyway with
 * inService preserved — future stories can flag low-confidence rows.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve repo paths
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CSV_PATH = "/Users/hassan/Downloads/hydrants_clean.csv";
const OUT_PATH = join(REPO_ROOT, "prisma", "seed-data", "hydrants.json");

// ---------------------------------------------------------------------------
// Env loading — Prisma 6 ships dotenv via @prisma/internals, but the CLI
// doesn't auto-load .env.local. Roll a tiny loader that handles both.
// ---------------------------------------------------------------------------
function loadEnv(file: string) {
  const path = join(REPO_ROOT, file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key]) continue; // existing env wins
    process.env[key] = raw.replace(/^"(.*)"$/, "$1");
  }
}
loadEnv(".env");
loadEnv(".env.local");

const TOKEN = process.env.MAPBOX_SECRET_TOKEN;
if (!TOKEN) {
  console.error("MAPBOX_SECRET_TOKEN not set. Put it in .env.local.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CSV parser. The source has quoted fields that contain commas, so a naive
// split(",") corrupts addresses. Implement a minimal state-machine parser
// rather than pulling in a dependency.
// ---------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // skip
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Row → Hydrant payload (pre-geocode)
// ---------------------------------------------------------------------------
type HydrantRow = {
  id: string;
  type: string;
  category: string;
  make: string | null;
  model: string | null;
  address: string;
  location: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  inService: boolean;
};

type EnrichedHydrant = HydrantRow & {
  lat: number | null;
  lng: number | null;
  geocodedAt: string | null;
  geocodeNote?: string;
};

function blankToNull(s: string | undefined): string | null {
  if (s === undefined) return null;
  const trimmed = s.trim();
  return trimmed === "" ? null : trimmed;
}

function rowToHydrant(headers: string[], row: string[]): HydrantRow | null {
  if (row.length < headers.length) return null;
  const get = (col: string) => row[headers.indexOf(col)];
  const id = blankToNull(get("ID"));
  const address = blankToNull(get("ADDRESS")) ?? blankToNull(get("LOCATION"));
  if (!id || !address) return null;
  return {
    id,
    type: blankToNull(get("TYPE")) ?? "Unknown",
    category: blankToNull(get("CATEGORY")) ?? "Pressurized",
    make: blankToNull(get("MAKE")),
    model: blankToNull(get("MODEL")),
    address,
    location: blankToNull(get("LOCATION")),
    street: blankToNull(get("STREET")),
    city: blankToNull(get("CITY")),
    state: blankToNull(get("STATE")),
    zip: blankToNull(get("ZIP")),
    inService: (get("IN_SERVICE") ?? "True").trim().toLowerCase() === "true",
  };
}

// ---------------------------------------------------------------------------
// Normalize an address for geocoding. The source data is patchy:
// - Some rows are full addresses ("420 Elm St, Portland, ME 04101")
// - Some are just intersections ("WOODSPELL DR @ LONGFELLOW RD")
// - Some are bare street names ("Julia DR")
// Append "Gorham, ME 04038" (the canonical town of the dataset) if the
// address doesn't already include a city/state hint. Cuts no-match rate
// dramatically vs. sending bare strings.
// ---------------------------------------------------------------------------
function normalizeForGeocode(address: string): string {
  const hasCity = /,\s*[A-Z]{2}\s*\d{5}?/i.test(address);
  return hasCity ? address : `${address}, Gorham, ME 04038`;
}

// ---------------------------------------------------------------------------
// Geocode one address — Mapbox v6 forward geocoding
// ---------------------------------------------------------------------------
async function geocode(
  address: string,
): Promise<{ lat: number; lng: number; confidence: number } | null> {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", normalizeForGeocode(address));
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", "us");
  url.searchParams.set("proximity", "-70.4444,43.6791"); // Gorham, ME centroid
  url.searchParams.set("access_token", TOKEN!);

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  ! ${res.status} for "${address}"`);
    return null;
  }
  const data = (await res.json()) as {
    features: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: { match_code?: { confidence?: string } };
    }>;
  };
  const f = data.features?.[0];
  if (!f?.geometry?.coordinates) return null;
  const [lng, lat] = f.geometry.coordinates;
  // match_code.confidence is "exact" | "high" | "medium" | "low"
  const c = f.properties?.match_code?.confidence ?? "low";
  const confidenceScore = { exact: 1, high: 0.8, medium: 0.6, low: 0.3 }[c] ?? 0;
  return { lat, lng, confidence: confidenceScore };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Reading CSV: ${CSV_PATH}`);
  const csv = readFileSync(CSV_PATH, "utf8");
  const rows = parseCsv(csv).filter((r) => r.length > 1);
  const headers = rows[0];
  console.log(`  ${rows.length - 1} data rows, columns: ${headers.join(", ")}`);

  const hydrants: HydrantRow[] = [];
  const seenIds = new Set<string>();
  for (const row of rows.slice(1)) {
    const h = rowToHydrant(headers, row);
    if (!h) continue;
    if (seenIds.has(h.id)) continue; // dedupe — CSV has occasional repeats
    seenIds.add(h.id);
    hydrants.push(h);
  }
  console.log(`  ${hydrants.length} unique hydrants after dedup`);

  const enriched: EnrichedHydrant[] = [];
  let geocoded = 0;
  let failed = 0;
  const startMs = Date.now();

  for (let i = 0; i < hydrants.length; i++) {
    const h = hydrants[i];
    const result = await geocode(h.address);
    // Accept any non-null result; even "low" confidence places the hydrant
    // in the right town, which is enough for a prototype. The geocodeNote
    // preserves the confidence tier for future stories that want to dedupe
    // or re-verify the low-confidence cluster.
    if (result && result.confidence > 0) {
      enriched.push({
        ...h,
        lat: result.lat,
        lng: result.lng,
        geocodedAt: new Date().toISOString(),
        geocodeNote: `confidence=${result.confidence}`,
      });
      geocoded++;
    } else {
      enriched.push({
        ...h,
        lat: null,
        lng: null,
        geocodedAt: null,
        geocodeNote: result
          ? `low-confidence (${result.confidence})`
          : "no-match",
      });
      failed++;
    }
    if ((i + 1) % 25 === 0) {
      const elapsed = Math.round((Date.now() - startMs) / 1000);
      console.log(
        `  [${i + 1}/${hydrants.length}] geocoded=${geocoded} failed=${failed} (${elapsed}s)`,
      );
    }
    await sleep(150);
  }

  const outDir = dirname(OUT_PATH);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(enriched, null, 2));
  console.log(
    `\nWrote ${enriched.length} hydrants to ${OUT_PATH}\n  geocoded: ${geocoded}\n  failed:   ${failed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
