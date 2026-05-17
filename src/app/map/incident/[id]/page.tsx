/**
 * /map/incident/[id] — Server entry point. The /map layout already gates
 * on requireFirefighter(); this file just renders the interactive view.
 *
 * HF-008 replaces the view with the polished bottom-sheet results screen.
 */
import IncidentView from "./incident-view";

export default function IncidentPage() {
  return <IncidentView />;
}
