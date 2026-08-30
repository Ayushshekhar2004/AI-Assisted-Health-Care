import Link from 'next/link';

import {
  getActiveIntakeSession,
  listIntakeMessages,
} from '@/modules/intake/server';

import { startIntakeAction } from './actions';
import { IntakeChat } from './intake-chat';
import { IntakeSafetyBanner } from './intake-safety-banner';

export default async function PatientIntakePage() {
  try {
    const session = await getActiveIntakeSession();
    const messages = session ? await listIntakeMessages(session.id) : [];

    return (
      <main>
        <h1>Patient intake</h1>
        <IntakeSafetyBanner />
        {session ? (
          <IntakeChat messages={messages} sessionId={session.id} />
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
