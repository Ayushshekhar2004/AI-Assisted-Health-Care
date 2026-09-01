import { logoutAction } from '@/app/auth/actions';
import Link from 'next/link';
import { getActiveRedFlag } from '@/modules/triage/server';

export default async function PatientHomePage() {
  let activeRedFlag;
  try {
    activeRedFlag = await getActiveRedFlag();
  } catch {
    return (
      <main>
        <h1>Patient area</h1>
        <p>Patient services are temporarily unavailable.</p>
        <form action={logoutAction}>
          <button type="submit">Sign out</button>
        </form>
      </main>
    );
  }

  if (activeRedFlag) {
    return (
      <main>
        <section className="emergency-guidance" role="alert">
          <h1>Seek urgent in-person help now</h1>
          <p>
            An emergency warning sign was recorded. Normal doctor routing is
            paused, and this app cannot rule out an emergency.
          </p>
          <Link href="/patient/emergency">
            Continue to emergency and referral guidance
          </Link>
        </section>
        <form action={logoutAction}>
          <button type="submit">Sign out</button>
        </form>
      </main>
    );
  }

  return (
    <main>
      <h1>Patient area</h1>
      <p>Your protected patient workspace is ready.</p>
      <p>
        <Link href="/patient/onboarding">Complete patient onboarding</Link>
      </p>
      <p>
        <Link href="/patient/doctors">Choose a suggested doctor</Link>
      </p>
      <p>
        <Link href="/patient/appointments">View appointments</Link>
      </p>
      <p>
        <Link href="/patient/history">View patient history</Link>
      </p>
      <p>
        <Link href="/patient/intake">Start patient intake</Link>
      </p>
      <p>
        <Link href="/patient/notifications">Notification preferences</Link>
      </p>
      <form action={logoutAction}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
