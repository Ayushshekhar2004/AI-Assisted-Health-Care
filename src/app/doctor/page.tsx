import { logoutAction } from '@/app/auth/actions';
import Link from 'next/link';
import type { DoctorVerificationState } from '@/modules/doctor';
import { getOwnDoctorVerificationState } from '@/modules/doctor/server';
import { parseDoctorDashboardQuery } from '@/modules/scheduling';
import {
  listDoctorDashboardAppointments,
  type DoctorDashboardPage,
} from '@/modules/scheduling/server';

import { DashboardAppointments } from './dashboard-appointments';
import { DashboardFilters } from './dashboard-filters';

const statusMessages = {
  pending_verification:
    'Pending verification. Your profile cannot be booked yet.',
  verified: 'Verified. Your professional profile has been approved.',
  rejected: 'Verification rejected. Review the reason below.',
  suspended: 'Verification suspended. Your profile cannot be booked.',
} as const;

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function DoctorHomePage({ searchParams }: PageProps) {
  let verification: DoctorVerificationState | null = null;
  let dashboard: DoctorDashboardPage | null = null;
  const rawSearchParams = await searchParams;
  const query = parseDoctorDashboardQuery(rawSearchParams);
  const [verificationResult, dashboardResult] = await Promise.allSettled([
    getOwnDoctorVerificationState(),
    listDoctorDashboardAppointments(query),
  ]);
  if (verificationResult.status === 'fulfilled') {
    verification = verificationResult.value;
  }
  if (dashboardResult.status === 'fulfilled') {
    dashboard = dashboardResult.value;
  }

  return (
    <main>
      <h1>Doctor area</h1>
      <p>Your protected clinician workspace is ready.</p>
      <DashboardFilters
        query={query}
        syncTimezone={rawSearchParams.timezoneOffsetMinutes === undefined}
      />
      {dashboard ? (
        <DashboardAppointments dashboard={dashboard} />
      ) : (
        <p>Appointments are temporarily unavailable.</p>
      )}
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
