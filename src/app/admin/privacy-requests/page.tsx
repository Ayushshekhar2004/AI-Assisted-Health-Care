import Link from 'next/link';

import { LocalDateTime } from '@/app/_components/local-date-time';
import { privacyRequestTypeLabels } from '@/modules/patient';
import { listPrivacyRequestsForOperations } from '@/modules/patient/privacy-request-server';

import { PrivacyRequestReviewForm } from './review-form';

export default async function PrivacyRequestQueuePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ page?: string }> }>) {
  try {
    const page = (await searchParams).page ?? '1';
    const queue = await listPrivacyRequestsForOperations(page);
    return (
      <main>
        <h1>Privacy request review queue</h1>
        <p>
          Request details are sensitive. Use them only to process the selected
          request. This workflow never deletes finalized medical records.
        </p>
        {queue.items.length ? (
          <div className="doctor-selection-list">
            {queue.items.map((request) => (
              <section className="doctor-selection-card" key={request.id}>
                <h2>{privacyRequestTypeLabels[request.requestType]}</h2>
                <p>Status: {request.status}</p>
                <p>
                  Submitted: <LocalDateTime startsAt={request.createdAt} />
                </p>
                <details>
                  <summary>Open request details</summary>
                  <p>{request.details}</p>
                </details>
                <p>
                  Protected medical records retained:{' '}
                  {request.protectedRecordsRetained ? 'yes' : 'no'}
                </p>
                <PrivacyRequestReviewForm
                  requestId={request.id}
                  status={request.status}
                />
              </section>
            ))}
          </div>
        ) : (
          <p>No privacy requests are waiting.</p>
        )}
        <nav aria-label="Privacy request pages">
          {queue.page > 1 ? (
            <Link href={`/admin/privacy-requests?page=${queue.page - 1}`}>
              Previous
            </Link>
          ) : null}{' '}
          {queue.page * 25 < queue.totalCount ? (
            <Link href={`/admin/privacy-requests?page=${queue.page + 1}`}>
              Next
            </Link>
          ) : null}
        </nav>
        <p>
          <Link href="/admin">Back to operations area</Link>
        </p>
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Privacy request review queue</h1>
        <p>Privacy requests are temporarily unavailable.</p>
        <Link href="/admin">Back to operations area</Link>
      </main>
    );
  }
}
