import Link from 'next/link';

import { LocalDateTime } from '@/app/_components/local-date-time';
import {
  consentPurposeLabels,
  consentVersions,
  type ManagedConsentPurpose,
  type PatientConsentRecord,
} from '@/modules/patient';
import { listOwnManagedConsents } from '@/modules/patient/consent-server';

import { ConsentControl } from './consent-control';

const purposes = Object.keys(consentVersions) as ManagedConsentPurpose[];

function latestForPurpose(
  records: PatientConsentRecord[],
  purpose: ManagedConsentPurpose,
) {
  return records.find((record) => record.purpose === purpose) ?? null;
}

export default async function PatientPrivacyPage() {
  try {
    const records = await listOwnManagedConsents();
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
