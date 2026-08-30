import { LocalDateTime } from '../../_components/local-date-time';
import {
  explainDoctorSuggestion,
  formatSpecialtyLabel,
  type DoctorMatch,
} from '../../../modules/doctor';
import { BookingForm } from '../appointments/booking-form';

const LANGUAGE_LABELS = { en: 'English', hi: 'Hindi' } as const;

function formatFee(feePaise: number | null): string {
  return feePaise === null
    ? 'Fee not provided'
    : `₹${(feePaise / 100).toFixed(2)}`;
}

export function DoctorSelectionCard({
  doctor,
}: Readonly<{ doctor: DoctorMatch }>) {
  return (
    <article className="doctor-selection-card">
      <h2>{doctor.doctorName}</h2>
      <dl className="doctor-details">
        <dt>Qualification</dt>
        <dd>{doctor.qualification}</dd>
        <dt>Registration number</dt>
        <dd>{doctor.registrationNumber}</dd>
        <dt>Specialty</dt>
        <dd>{formatSpecialtyLabel(doctor.specialty)}</dd>
        <dt>Languages</dt>
        <dd>
          {doctor.consultationLanguages
            .map((language) => LANGUAGE_LABELS[language])
            .join(', ')}
        </dd>
        <dt>Consultation mode</dt>
        <dd>
          {doctor.consultationMode === 'TELECONSULTATION'
            ? 'Teleconsultation'
            : `In person${doctor.clinicCity ? ` · ${doctor.clinicCity}` : ''}`}
        </dd>
        <dt>Fee</dt>
        <dd>{formatFee(doctor.feePaise)}</dd>
      </dl>

      <section aria-label={`Why ${doctor.doctorName} was suggested`}>
        <h3>Why this doctor was suggested</h3>
        <p>{explainDoctorSuggestion(doctor)}</p>
        <p className="selection-disclaimer">
          This is a routing suggestion, not a diagnosis or endorsement of
          clinical outcomes.
        </p>
      </section>

      <section aria-label={`Next slots for ${doctor.doctorName}`}>
        <h3>Next available slots</h3>
        <ul className="doctor-slot-list">
          {doctor.nextSlots.map((slot) => (
            <li key={slot.id}>
              <LocalDateTime endsAt={slot.endsAt} startsAt={slot.startsAt} />
              <BookingForm availabilityId={slot.id} />
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
