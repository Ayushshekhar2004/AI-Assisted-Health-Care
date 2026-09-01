import type { ConsultationOutcome } from '@/modules/consultation';
import { PILOT_SPECIALTY_LABELS } from '../../../modules/doctor';
export function OutcomeView({
  outcome,
}: Readonly<{ outcome: ConsultationOutcome }>) {
  return (
    <section aria-label="Consultation outcome">
      <h4>Consultation outcome</h4>
      <p>{outcome.outcome.replaceAll('_', ' ')}</p>
      {outcome.referralSpecialty ? (
        <p>Referral: {PILOT_SPECIALTY_LABELS[outcome.referralSpecialty]}</p>
      ) : null}
      {outcome.clinicLocation ? (
        <p>Clinic/location: {outcome.clinicLocation}</p>
      ) : null}
      {outcome.locationInstructions ? (
        <p>Directions: {outcome.locationInstructions}</p>
      ) : null}
      {outcome.appointmentNote ? (
        <p>Appointment note: {outcome.appointmentNote}</p>
      ) : null}
    </section>
  );
}
