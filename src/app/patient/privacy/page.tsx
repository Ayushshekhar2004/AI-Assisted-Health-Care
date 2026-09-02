import Link from 'next/link';

import { LocalDateTime } from '@/app/_components/local-date-time';
import {
  consentPurposeLabels,
  consentVersions,
  privacyRequestTypeLabels,
  type ManagedConsentPurpose,
  type PatientConsentRecord,
} from '@/modules/patient';
import { listOwnManagedConsents } from '@/modules/patient/consent-server';
import { listOwnPrivacyRequests } from '@/modules/patient/privacy-request-server';

import { ConsentControl } from './consent-control';
import { PrivacyRequestForm } from './privacy-request-form';

const purposes = Object.keys(consentVersions) as ManagedConsentPurpose[];

function latestForPurpose(
  records: PatientConsentRecord[],
  purpose: ManagedConsentPurpose,
) {
  return records.find((record) => record.purpose === purpose) ?? null;
}

export default async function PatientPrivacyPage() {
  try {
    const [records, privacyRequests] = await Promise.all([
      listOwnManagedConsents(),
      listOwnPrivacyRequests(),
    ]);
    return (
      <main>
        <h1>Consent and privacy center</h1>
        <p>
          Review purpose-specific consent and its policy version. New decisions
          are appended to the history; earlier records are not rewritten.
        </p>
        <p>
          Revocation applies to future processing. Records already required for
          care, safety, legal, or audit obligations may still need to be
          retained.
        </p>
        <div className="doctor-selection-list">
          {purposes.map((purpose) => {
            const latest = latestForPurpose(records, purpose);
            return (
              <section className="doctor-selection-card" key={purpose}>
                <h2>{consentPurposeLabels[purpose]}</h2>
                <p>Current policy version: {consentVersions[purpose]}</p>
                <p>
                  Current decision:{' '}
                  {latest ? latest.status : 'not yet recorded'}
                </p>
                <ConsentControl
                  currentlyGranted={latest?.status === 'granted'}
                  purpose={purpose}
                />
                <h3>Decision history</h3>
                {records.some((record) => record.purpose === purpose) ? (
                  <ul>
                    {records
                      .filter((record) => record.purpose === purpose)
                      .map((record) => (
                        <li key={record.id}>
                          {record.status} under {record.policyVersion} —{' '}
                          <LocalDateTime startsAt={record.effectiveAt} />
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p>No decision recorded.</p>
                )}
              </section>
            );
          })}
        </div>
        <section>
          <h2>Account and privacy requests</h2>
          <p>
            Request an export, correction, account deactivation or deletion
            review, or submit a grievance. A reviewer will process the request;
            submission does not automatically change or delete records.
          </p>
          <PrivacyRequestForm />
          <h3>Your request history</h3>
          {privacyRequests.length ? (
            <ul>
              {privacyRequests.map((request) => (
                <li key={request.id}>
                  {privacyRequestTypeLabels[request.requestType]} —{' '}
                  {request.status.toLowerCase().replaceAll('_', ' ')} —{' '}
                  <LocalDateTime startsAt={request.createdAt} />
                  {request.protectedRecordsRetained
                    ? ' — protected medical records retained'
                    : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>No privacy requests submitted.</p>
          )}
        </section>
        <p>
          <Link href="/patient">Back to patient area</Link>
        </p>
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Consent and privacy center</h1>
        <p>Consent preferences are temporarily unavailable.</p>
        <Link href="/patient">Back to patient area</Link>
      </main>
    );
  }
}
