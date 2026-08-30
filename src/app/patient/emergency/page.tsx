import { redirect } from 'next/navigation';

import { getIntakeSummaryForHandoff } from '@/modules/intake/server';
import {
  getActiveRedFlag,
  recordEmergencyPathwayEntry,
} from '@/modules/triage/server';

import { EmergencyGuidance } from './emergency-guidance';
import { IntakeHandoffSummary } from './intake-handoff-summary';

export default async function PatientEmergencyPage() {
  const redFlag = await getActiveRedFlag();
  if (!redFlag) redirect('/patient/intake');

  let summary = null;
  try {
    summary = await getIntakeSummaryForHandoff(redFlag.intakeSessionId);
  } catch {
    // Keep urgent guidance visible even if the handoff summary is unavailable.
  }
  try {
    await recordEmergencyPathwayEntry(redFlag.id);
  } catch {
    // Keep urgent guidance and any available handoff summary visible if auditing is unavailable.
  }

  return (
    <main>
      <EmergencyGuidance />
      <IntakeHandoffSummary summary={summary} />
    </main>
  );
}
