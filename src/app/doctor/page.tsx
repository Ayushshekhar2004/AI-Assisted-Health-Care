import { logoutAction } from '@/app/auth/actions';
import Link from 'next/link';
import type { DoctorVerificationState } from '@/modules/doctor';
import { getOwnDoctorVerificationState } from '@/modules/doctor/server';

const statusMessages = {
  pending_verification:
    'Pending verification. Your profile cannot be booked yet.',
  verified: 'Verified. Your professional profile has been approved.',
  rejected: 'Verification rejected. Review the reason below.',
  suspended: 'Verification suspended. Your profile cannot be booked.',
} as const;

export default async function DoctorHomePage() {
  let verification: DoctorVerificationState | null = null;
  try {
    verification = await getOwnDoctorVerificationState();
  } catch {
    // Render the generic unavailable state without exposing provider details.
  }

  return (
    <main>
      <h1>Doctor area</h1>
      <p>Your protected clinician workspace is ready.</p>
      {verification ? (
        <section aria-labelledby="verification-status">
          <h2 id="verification-status">Verification status</h2>
          <p>{statusMessages[verification.status]}</p>
          <p>Bookable: {verification.isBookable ? 'Yes' : 'No'}</p>
          {verification.reason ? (
            <p>Review note: {verification.reason}</p>
          ) : null}
          {verification.decidedAt ? (
            <p>
              Decision recorded:{' '}
              {new Date(verification.decidedAt).toLocaleString()}
            </p>
          ) : null}
        </section>
      ) : (
        <p>Verification status is unavailable.</p>
      )}
      {!verification?.onboardingCompletedAt ? (
        <p>
          <Link href="/doctor/onboarding">Complete doctor onboarding</Link>
        </p>
      ) : null}
      {verification?.isBookable ? (
        <p>
          <Link href="/doctor/availability">Edit availability</Link>
        </p>
      ) : null}
      <form action={logoutAction}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
