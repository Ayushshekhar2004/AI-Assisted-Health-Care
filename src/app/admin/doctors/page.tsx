import {
  listDoctorVerificationQueue,
  type DoctorVerificationQueueEntry,
} from '@/modules/doctor/server';

import { VerificationForm } from './verification-form';

function formatFee(feePaise: number | null): string {
  return feePaise === null ? 'Not provided' : `₹${(feePaise / 100).toFixed(2)}`;
}

export default async function DoctorVerificationQueuePage() {
  let queue: DoctorVerificationQueueEntry[] = [];
  try {
    queue = await listDoctorVerificationQueue();
  } catch {
    return (
      <main>
        <h1>Doctor verification queue</h1>
        <p>Unable to load the verification queue.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Doctor verification queue</h1>
      <p>
        Review professional credentials before approving or rejecting a doctor.
      </p>
      {queue.length === 0 ? (
        <p>No doctors are waiting for verification.</p>
      ) : null}
      {queue.map((doctor) => (
        <article key={doctor.id}>
          <h2>{doctor.fullName}</h2>
          <dl>
            <dt>Qualification</dt>
            <dd>{doctor.qualification}</dd>
            <dt>Registration</dt>
            <dd>
              {doctor.registrationNumber} · {doctor.registrationCouncil} ·{' '}
              {doctor.registrationState}
            </dd>
            <dt>Specialty</dt>
            <dd>{doctor.specialty}</dd>
            <dt>Languages</dt>
            <dd>{doctor.languages.join(', ')}</dd>
            <dt>Teleconsultation fee</dt>
            <dd>{formatFee(doctor.teleconsultationFeePaise)}</dd>
            <dt>Clinic</dt>
            <dd>
              {[doctor.clinicCity, doctor.clinicAddress]
                .filter(Boolean)
                .join(' · ') || 'Not provided'}
            </dd>
            <dt>Profile photo</dt>
            <dd>
              {doctor.hasProfilePhoto ? 'Submitted privately' : 'Not provided'}
            </dd>
          </dl>
          <VerificationForm doctorId={doctor.id} />
        </article>
      ))}
    </main>
  );
}
