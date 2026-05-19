/**
 * /map/new — Server entry point for the new-incident form.
 *
 * The /map layout already gates on requireFirefighter(). We re-read the
 * firefighter here only to pass its unitId into the form as the prefill
 * default (per AC: "UNIT prefilled from the badge cookie's unit").
 *
 * The interactive form lives in new-incident-form.tsx (Client Component).
 */
import { requireFirefighter } from "@/lib/auth";
import NewIncidentForm from "./new-incident-form";

export default async function NewIncidentPage() {
  const firefighter = await requireFirefighter();
  return <NewIncidentForm initialUnitId={firefighter.unitId} />;
}
