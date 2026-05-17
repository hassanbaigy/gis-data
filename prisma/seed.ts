/**
 * Seed script.
 *
 * Runs every `pnpm prisma db seed`. Idempotent — uses upsert for the
 * firefighter and hydrants, deleteMany + createMany for incidents (so the
 * 6 sample incidents are deterministic across reseeds).
 *
 * Reads the pre-geocoded hydrant snapshot from prisma/seed-data/hydrants.json
 * (committed). To regenerate that snapshot, run scripts/enrich-hydrants.ts.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

type EnrichedHydrant = {
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
  lat: number | null;
  lng: number | null;
  geocodedAt: string | null;
};

async function seedHydrants() {
  const path = join(__dirname, "seed-data", "hydrants.json");
  const hydrants = JSON.parse(readFileSync(path, "utf8")) as EnrichedHydrant[];
  console.log(`Loading ${hydrants.length} hydrants from ${path}`);

  // SQLite + Prisma doesn't support createMany with conflict handling on
  // every version; upsert is reliable across versions and small N.
  let i = 0;
  for (const h of hydrants) {
    await prisma.hydrant.upsert({
      where: { id: h.id },
      create: {
        id: h.id,
        type: h.type,
        category: h.category,
        make: h.make,
        model: h.model,
        address: h.address,
        location: h.location,
        street: h.street,
        city: h.city,
        state: h.state,
        zip: h.zip,
        inService: h.inService,
        lat: h.lat,
        lng: h.lng,
        geocodedAt: h.geocodedAt ? new Date(h.geocodedAt) : null,
      },
      update: {
        // re-running seed shouldn't reset operational flags; only re-apply
        // immutable identity fields and the geocode if it changed.
        type: h.type,
        category: h.category,
        address: h.address,
        location: h.location,
        lat: h.lat,
        lng: h.lng,
        geocodedAt: h.geocodedAt ? new Date(h.geocodedAt) : null,
      },
    });
    i++;
    if (i % 100 === 0) console.log(`  ${i}/${hydrants.length}`);
  }
  console.log(`  hydrants seeded: ${i}`);
}

async function seedFirefighter() {
  const ff = await prisma.firefighter.upsert({
    where: { badge: "0418" },
    create: { badge: "0418", unitId: "E-12" },
    update: {},
  });
  console.log(`Firefighter ready: ${ff.badge} (${ff.unitId})`);
  return ff;
}

async function seedIncidents(firefighterId: string) {
  // Wipe + reseed for determinism. This makes the spec's count check stable.
  await prisma.incident.deleteMany({});

  // Real coords scattered in / around Gorham, ME (the hydrant cluster centre).
  // Each incident sits within ~3km of the centroid; types cover 4 categories
  // for the filter UI to have variety. Alarm levels span 1-5.
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3600_000);

  const incidents = [
    {
      address: "143 Main St, Gorham, ME 04038",
      lat: 43.6794,
      lng: -70.4448,
      type: "STRUCTURE",
      alarmLevel: 3,
      notes: "Kitchen fire — contained on arrival",
      hoursAgo: 6,
    },
    {
      address: "26 Husky Dr, Gorham, ME 04038",
      lat: 43.6724,
      lng: -70.448,
      type: "VEHICLE",
      alarmLevel: 1,
      notes: "Engine bay — small fuel leak",
      hoursAgo: 18,
    },
    {
      address: "Mosher Rd, Gorham, ME 04038",
      lat: 43.6849,
      lng: -70.4332,
      type: "BRUSH",
      alarmLevel: 2,
      notes: "Field along Mosher Rd, ~2 acres",
      hoursAgo: 30,
    },
    {
      address: "75 College Ave, Gorham, ME 04038",
      lat: 43.6802,
      lng: -70.4439,
      type: "MEDICAL",
      alarmLevel: 1,
      notes: "Medical assist — university dorm",
      hoursAgo: 52,
    },
    {
      address: "420 Fort Hill Rd, Gorham, ME 04038",
      lat: 43.671,
      lng: -70.4202,
      type: "HAZMAT",
      alarmLevel: 4,
      notes: "Diesel spill at construction site",
      hoursAgo: 84,
    },
    {
      address: "8 South St, Gorham, ME 04038",
      lat: 43.6783,
      lng: -70.4427,
      type: "STRUCTURE",
      alarmLevel: 5,
      notes: "Multi-alarm — fully involved 2-story",
      hoursAgo: 110,
    },
  ];

  for (const inc of incidents) {
    await prisma.incident.create({
      data: {
        address: inc.address,
        lat: inc.lat,
        lng: inc.lng,
        type: inc.type,
        alarmLevel: inc.alarmLevel,
        notes: inc.notes,
        unitId: "E-12",
        firefighterId,
        createdAt: hoursAgo(inc.hoursAgo),
      },
    });
  }
  console.log(`Incidents seeded: ${incidents.length}`);
}

async function main() {
  console.log("--- seeding ---");
  const ff = await seedFirefighter();
  await seedHydrants();
  await seedIncidents(ff.id);
  console.log("done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
