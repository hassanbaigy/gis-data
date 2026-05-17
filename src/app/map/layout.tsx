/**
 * /map/* auth gate.
 *
 * Every route under /map (the home /map, /map/new, /map/incident/[id], etc.)
 * requires a signed-in firefighter. The layout is a Server Component that
 * calls `requireFirefighter()` before rendering any child — which redirects
 * to /login on a missing or stale cookie.
 *
 * Putting the gate in the layout (rather than each page) means a future
 * /map sub-route can't accidentally ship unauthenticated. The cost of one
 * extra Prisma lookup per /map navigation is acceptable for a prototype.
 */
import { requireFirefighter } from "@/lib/auth";

export default async function MapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFirefighter();
  return <>{children}</>;
}
