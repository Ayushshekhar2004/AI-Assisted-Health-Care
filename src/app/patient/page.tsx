import { logoutAction } from '@/app/auth/actions';
import Link from 'next/link';

export default function PatientHomePage() {
  return (
    <main>
      <h1>Patient area</h1>
      <p>Your protected patient workspace is ready.</p>
      <p>
        <Link href="/patient/onboarding">Complete patient onboarding</Link>
      </p>
      <form action={logoutAction}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
