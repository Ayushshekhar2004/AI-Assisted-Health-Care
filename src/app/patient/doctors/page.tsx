import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  consultationModeSchema,
  type ConsultationMode,
} from '@/modules/doctor';
import { findMatchingDoctors } from '@/modules/doctor/server';
import { getActiveRedFlag } from '@/modules/triage/server';

import { DoctorSelectionCard } from './doctor-selection-card';

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof error.digest === 'string' &&
    error.digest.startsWith('NEXT_REDIRECT')
  );
}

export default async function PatientDoctorSelectionPage({
  searchParams,
}: PageProps) {
  const rawMode = (await searchParams).mode;
  const parsedMode = consultationModeSchema.safeParse(rawMode);
  const consultationMode: ConsultationMode = parsedMode.success
    ? parsedMode.data
    : 'TELECONSULTATION';

  try {
    if (await getActiveRedFlag()) redirect('/patient/emergency');
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return <DoctorSelectionUnavailable />;
  }

  try {
    const availableFrom = new Date();
    const availableUntil = new Date(availableFrom);
    availableUntil.setUTCDate(availableUntil.getUTCDate() + 30);
    const doctors = await findMatchingDoctors({
      consultationMode,
      availableFrom: availableFrom.toISOString(),
      availableUntil: availableUntil.toISOString(),
    });

    return (
      <main>
        <h1>Choose a doctor</h1>
        <p>
          This shortlist uses your latest non-diagnostic specialty routing
          result, preferred language, and open appointment times. It does not
          rank doctors using age, gender, health history, or other sensitive
          attributes.
        </p>

        <form className="consultation-mode-form" method="get">
          <label htmlFor="consultation-mode">Consultation mode</label>
          <select
            defaultValue={consultationMode}
            id="consultation-mode"
            name="mode"
          >
            <option value="TELECONSULTATION">Teleconsultation</option>
            <option value="IN_PERSON">In person</option>
          </select>
          <button type="submit">Update shortlist</button>
        </form>

        {doctors.length === 0 ? (
          <p>No matching doctors have open slots in the next 30 days.</p>
        ) : (
          <div className="doctor-selection-list">
            {doctors.map((doctor) => (
              <DoctorSelectionCard doctor={doctor} key={doctor.doctorId} />
            ))}
          </div>
        )}

        <p>Times are shown in your current device timezone.</p>
        <p>
          <Link href="/patient">Back to patient area</Link>
        </p>
      </main>
    );
  } catch {
    return <DoctorSelectionUnavailable />;
  }
}

function DoctorSelectionUnavailable() {
  return (
    <main>
      <h1>Choose a doctor</h1>
      <p>
        Doctor suggestions are unavailable. Complete patient onboarding and
        intake routing first, then try again.
      </p>
      <p>
        <Link href="/patient/intake">Go to patient intake</Link>
      </p>
      <p>
        <Link href="/patient">Back to patient area</Link>
      </p>
    </main>
  );
}
