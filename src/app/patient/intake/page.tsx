import Link from 'next/link';

import {
  getActiveIntakeSession,
  listIntakeMessages,
} from '@/modules/intake/server';
import {
  getActiveRedFlag,
  getSafeCareWhileWaiting,
  getLatestTriageResultForSession,
} from '@/modules/triage/server';

import { startIntakeAction } from './actions';
import { EmergencyScreeningForm } from './emergency-screening-form';
import { IntakeChat } from './intake-chat';
import { IntakeSafetyBanner } from './intake-safety-banner';
import { SafeCareGuidance } from './safe-care-guidance';

export default async function PatientIntakePage() {
  try {
    const activeRedFlag = await getActiveRedFlag();
    if (activeRedFlag) {
      return (
        <main>
          <h1>Patient intake</h1>
          <section className="emergency-guidance" role="alert">
            <h2>Emergency warning sign recorded</h2>
            <p>
              Normal intake and doctor routing are paused. Seek urgent in-person
              or emergency care now. This app cannot rule out an emergency.
            </p>
            <Link href="/patient/emergency">
              Continue to emergency and referral guidance
            </Link>
          </section>
        </main>
      );
    }
    const session = await getActiveIntakeSession();
    const messages = session ? await listIntakeMessages(session.id) : [];
    const latestTriage = session
      ? await getLatestTriageResultForSession(session.id)
      : null;
    const safeCareGuidance = session ? null : await getSafeCareWhileWaiting();

    return (
      <main>
        <h1>Patient intake</h1>
        <IntakeSafetyBanner />
        {session && latestTriage?.outcome === 'NO_RED_FLAG' ? (
          <IntakeChat messages={messages} sessionId={session.id} />
        ) : session ? (
          <EmergencyScreeningForm sessionId={session.id} />
        ) : safeCareGuidance ? (
          <SafeCareGuidance guidance={safeCareGuidance} />
        ) : (
          <form action={startIntakeAction}>
            <p>Start a private intake session when you are ready.</p>
            <button type="submit">Start intake</button>
          </form>
        )}
        <p>
          <Link href="/patient">Back to patient area</Link>
        </p>
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Patient intake</h1>
        <IntakeSafetyBanner />
        <p>
          Intake is unavailable. Complete patient onboarding before starting.
        </p>
        <p>
          <Link href="/patient">Back to patient area</Link>
        </p>
      </main>
    );
  }
}
