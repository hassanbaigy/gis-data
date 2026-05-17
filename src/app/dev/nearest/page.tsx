/**
 * /dev/nearest — dev-only sanity-check fixture.
 *
 * This file is a Server Component that gates on `process.env.NODE_ENV` at
 * render time via `notFound()`. The interactive logic lives in the
 * separate `<NearestDevClient>` Client Component below — which means
 * `mapbox-gl` is only bundled into the route that needs it, and the gate
 * prevents the interactive component from rendering in production builds.
 *
 * HF-008 will likely delete this entirely; HF-006 keeps it as a useful
 * developer fixture that mirrors the structure of /map/incident/[id].
 */
import { notFound } from "next/navigation";
import NearestDevClient from "./client";

export default function NearestDevDemo() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <NearestDevClient />;
}
