import type { PatientDocument } from '@/modules/patient';

const labels = {
  PENDING_SCAN: 'Pending malware scan',
  CLEAN: 'Scan passed',
  QUARANTINED: 'Quarantined',
  REJECTED: 'Rejected by scanner',
  SCAN_FAILED: 'Scan failed',
} as const;

export function DoctorDocumentList({
  documents,
}: {
  documents: readonly PatientDocument[];
}) {
  return (
    <section aria-labelledby="patient-documents">
      <h2 id="patient-documents">Patient documents</h2>
      <p>
        Files open as downloads only. Browser inline rendering is disabled for
        untrusted documents.
      </p>
      {documents.length === 0 ? (
        <p>No documents were shared for this appointment.</p>
      ) : (
        <ul>
          {documents.map((document) => (
            <li key={document.id}>
              <p>
                {document.filename} ({Math.ceil(document.sizeBytes / 1024)} KB)
              </p>
              <p>Status: {labels[document.scanStatus]}</p>
              {document.scanStatus === 'CLEAN' ? (
                <a href={`/api/doctor/documents/${document.id}/download`}>
                  Download scanned file
                </a>
              ) : (
                <p>
                  Unavailable until a configured malware scanner marks this file
                  clean.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
