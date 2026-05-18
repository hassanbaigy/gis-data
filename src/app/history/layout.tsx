/**
 * /history auth gate (HF-009).
 *
 * Mirrors `/map/layout.tsx` — a Server Component that calls
 * `requireFirefighter()` before any child renders. Future `/history`
 * sub-routes (none planned right now) would inherit this gate.
 */
import { requireFirefighter } from "@/lib/auth";

export default async function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFirefighter();
  return <>{children}</>;
}
