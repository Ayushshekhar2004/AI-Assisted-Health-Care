import Link from 'next/link';

import type { PatientHistoryPage } from '@/modules/patient/history-server';

import { LocalDateTime } from '../../_components/local-date-time';

const labels: Record<string, string> = {
  TELECONSULT_COMPLETED: 'Teleconsultation completed',
  FOLLOW_UP_REQUIRED: 'Follow-up required',
  REFER_SPECIALTY: 'Referral to another specialty',
  PHYSICAL_EXAM_REQUIRED: 'Physical examination required',
};

function pageHref(page: number): string {
  return `/patient/history?page=${page}`;
}

export function PatientHistoryList({
  history,
}: Readonly<{ history: PatientHistoryPage }>) {
  if (history.items.length === 0) {
    return <p>No past appointments are available.</p>;
  }

  return (
    <>
      <p>
        Showing {history.items.length} of {history.totalCount} past
        appointments.
      </p>
      <ol className="scheduling-list">
        {history.items.map((item) => (
          <li key={item.appointmentId}>
            <h2>{item.doctorName}</h2>
            <p>Specialty: {item.doctorSpecialty.replaceAll('_', ' ')}</p>
            <p>
              <LocalDateTime endsAt={item.endsAt} startsAt={item.startsAt} />
            </p>
            <p>Status: {item.status.replaceAll('_', ' ')}</p>

            <section aria-label="Consultation outcome">
              <h3>Consultation outcome</h3>
              {item.outcome ? (
                <>
                  <p>{labels[item.outcome.outcome]}</p>
                  {item.outcome.referral_specialty ? (
                    <p>
                      Referred specialty:{' '}
                      {item.outcome.referral_specialty.replaceAll('_', ' ')}
                    </p>
                  ) : null}
                  {item.outcome.clinic_location ? (
                    <p>Clinic/location: {item.outcome.clinic_location}</p>
                  ) : null}
                  {item.outcome.location_instructions ? (
                    <p>Instructions: {item.outcome.location_instructions}</p>
                  ) : null}
                  {item.outcome.appointment_note ? (
                    <p>Appointment note: {item.outcome.appointment_note}</p>
                  ) : null}
                </>
              ) : (
                <p>No finalized outcome is available.</p>
              )}
            </section>

            <section aria-label="Finalized prescription">
              <h3>Finalized prescription</h3>
              {item.prescription ? (
                <>
                  <p>Date: {item.prescription.prescription_date}</p>
                  {item.prescription.items.length ? (
                    <ul>
                      {item.prescription.items.map((entry) => (
                        <li key={entry.id}>
                          <strong>{entry.item_name}</strong> ({entry.item_type})
                          {[entry.dosage, entry.frequency, entry.duration]
                            .filter(Boolean)
                            .join(' · ')}
                          {entry.instructions ? (
                            <p>{entry.instructions}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No prescription entries.</p>
                  )}
                  {item.prescription.follow_up ? (
                    <p>Follow-up: {item.prescription.follow_up}</p>
                  ) : null}
                </>
              ) : (
                <p>No finalized prescription is available.</p>
              )}
            </section>

            {item.outcome || item.prescription ? (
              <p>
                <a
                  href={`/api/patient/appointments/${item.appointmentId}/packet`}
                >
                  Download my consultation packet
                </a>
              </p>
            ) : null}

            <section aria-label="Uploaded documents">
              <h3>Uploaded documents</h3>
              {item.documents.length ? (
                <ul>
                  {item.documents.map((document) => (
                    <li key={document.id}>
                      {document.filename} (
                      {Math.ceil(document.size_bytes / 1024)}
                      {' KB'}) — {document.scan_status.replaceAll('_', ' ')}
                      {document.scan_status === 'CLEAN' ? (
                        <>
                          {' · '}
                          <a href={`/api/documents/${document.id}/download`}>
                            Download
                          </a>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No uploaded documents.</p>
              )}
            </section>
          </li>
        ))}
      </ol>
      {history.totalPages > 1 ? (
        <nav aria-label="Patient history pages" className="pagination">
          {history.page > 1 ? (
            <Link href={pageHref(history.page - 1)}>Previous</Link>
          ) : null}
          <span>
            Page {history.page} of {history.totalPages}
          </span>
          {history.page < history.totalPages ? (
            <Link href={pageHref(history.page + 1)}>Next</Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
