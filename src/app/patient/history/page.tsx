import Link from 'next/link';

import { listOwnPatientHistory } from '@/modules/patient/history-server';

import { PatientHistoryList } from './history-list';

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function PatientHistoryPage({ searchParams }: PageProps) {
  try {
    const history = await listOwnPatientHistory(await searchParams);
    return (
      <main>
        <h1>Patient history</h1>
        <p>
          Past appointments and records explicitly shared with your patient
          account.
        </p>
        <PatientHistoryList history={history} />
        <p>
          <Link href="/patient">Back to patient area</Link>
        </p>
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Patient history</h1>
        <p>Patient history is temporarily unavailable.</p>
        <p>
          <Link href="/patient">Back to patient area</Link>
        </p>
      </main>
    );
  }
}
