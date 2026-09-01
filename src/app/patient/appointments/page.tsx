import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LocalDateTime } from '@/app/_components/local-date-time';
import { AppointmentVideoCall } from '@/app/_components/appointment-video-call';
import { getOwnConsultationNote } from '@/modules/consultation/server';
import {
  listBookableSlots,
  listAppointmentRescheduleOptions,
  listOwnPatientAppointments,
} from '@/modules/scheduling/server';
import { getActiveRedFlag } from '@/modules/triage/server';

import { BookingForm } from './booking-form';
import { ConsultationNoteView } from './consultation-note-view';
import { getOwnConsultationOutcome } from '@/modules/consultation/outcome-server';
import { OutcomeView } from './outcome-view';
import { listOwnPatientDocuments } from '@/modules/patient/document-server';
import { DocumentUploadForm } from './document-upload-form';
import { PatientAppointmentChangeForm } from './appointment-change-form';
import { getOwnFollowUpRecommendation } from '@/modules/consultation/follow-up-server';
import { listFollowUpBookingOptions } from '@/modules/scheduling/server';
import { FollowUpBooking } from './follow-up-booking';

function formatFee(feePaise: number | null): string {
  return feePaise === null
    ? 'Fee not provided'
    : `₹${(feePaise / 100).toFixed(2)}`;
}

export default async function PatientAppointmentsPage() {
  try {
    if (await getActiveRedFlag()) redirect('/patient/emergency');
  } catch (error) {
    // Next.js redirects are control-flow exceptions and must not be converted to a fallback page.
    if (
      typeof error === 'object' &&
      error !== null &&
      'digest' in error &&
      typeof error.digest === 'string' &&
      error.digest.startsWith('NEXT_REDIRECT')
    ) {
      throw error;
    }
    return (
      <main>
        <h1>Appointments</h1>
        <p>Appointments are temporarily unavailable.</p>
        <p>
          <Link href="/patient">Back to patient area</Link>
        </p>
      </main>
    );
  }

  try {
    const [slots, appointments] = await Promise.all([
      listBookableSlots(),
      listOwnPatientAppointments(),
    ]);
    const consultationNotes = new Map(
      await Promise.all(
        appointments.map(
          async (appointment) =>
            [
              appointment.id,
              await getOwnConsultationNote(appointment.id),
            ] as const,
        ),
      ),
    );
    const outcomes = new Map(
      await Promise.all(
        appointments.map(
          async (appointment) =>
            [
              appointment.id,
              await getOwnConsultationOutcome(appointment.id),
            ] as const,
        ),
      ),
    );
    const documents = new Map(
      await Promise.all(
        appointments.map(
          async (appointment) =>
            [
              appointment.id,
              await listOwnPatientDocuments(appointment.id),
            ] as const,
        ),
      ),
    );
    const rescheduleOptions = new Map(
      await Promise.all(
        appointments.map(
          async (appointment) =>
            [
              appointment.id,
              ['REQUESTED', 'CONFIRMED'].includes(appointment.status)
                ? await listAppointmentRescheduleOptions(appointment.id)
                : [],
            ] as const,
        ),
      ),
    );
    const followUpRecommendations = new Map(
      await Promise.all(
        appointments.map(
          async (appointment) =>
            [
              appointment.id,
              await getOwnFollowUpRecommendation(appointment.id),
            ] as const,
        ),
      ),
    );
    const followUpOptions = new Map(
      await Promise.all(
        Array.from(followUpRecommendations.values())
          .filter(
            (recommendation) =>
              recommendation && !recommendation.bookedAppointmentId,
          )
          .map(
            async (recommendation) =>
              [
                recommendation!.id,
                await listFollowUpBookingOptions(recommendation!.id),
              ] as const,
          ),
      ),
    );

    return (
      <main>
        <h1>Appointments</h1>
        <p>All appointment times below use your current device timezone.</p>

        <section aria-labelledby="available-slots">
          <h2 id="available-slots">Available slots</h2>
          {slots.length === 0 ? <p>No slots are currently available.</p> : null}
          <ul className="scheduling-list">
            {slots.map((slot) => (
              <li key={slot.id}>
                <h3>{slot.doctorName}</h3>
                <p>{slot.specialty}</p>
                <p>
                  <LocalDateTime
                    endsAt={slot.endsAt}
                    startsAt={slot.startsAt}
                  />
                </p>
                <p>{formatFee(slot.feePaise)}</p>
                <BookingForm availabilityId={slot.id} />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="your-appointments">
          <h2 id="your-appointments">Your appointments</h2>
          {appointments.length === 0 ? <p>You have no appointments.</p> : null}
          <ul className="scheduling-list">
            {appointments.map((appointment) => (
              <li key={appointment.id}>
                <h3>{appointment.doctorName}</h3>
                <p>
                  <LocalDateTime
                    endsAt={appointment.endsAt}
                    startsAt={appointment.startsAt}
                  />
                </p>
                <p>{formatFee(appointment.feePaise)}</p>
                <p>Status: {appointment.status.replaceAll('_', ' ')}</p>
                {['REQUESTED', 'CONFIRMED'].includes(appointment.status) ? (
                  <PatientAppointmentChangeForm
                    appointmentId={appointment.id}
                    options={rescheduleOptions.get(appointment.id) ?? []}
                  />
                ) : null}
                <DocumentUploadForm appointmentId={appointment.id} />
                {(documents.get(appointment.id) ?? []).length > 0 ? (
                  <ul>
                    {(documents.get(appointment.id) ?? []).map((document) => (
                      <li key={document.id}>
                        {document.filename} (
                        {Math.ceil(document.sizeBytes / 1024)} KB){' '}
                        <a href={`/api/documents/${document.id}/download`}>
                          Download
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {['CONFIRMED', 'IN_PROGRESS'].includes(appointment.status) ? (
                  <AppointmentVideoCall appointmentId={appointment.id} />
                ) : null}
                {consultationNotes.get(appointment.id) ? (
                  <ConsultationNoteView
                    note={consultationNotes.get(appointment.id)!}
                  />
                ) : null}
                {outcomes.get(appointment.id) ? (
                  <OutcomeView outcome={outcomes.get(appointment.id)!} />
                ) : null}
                {followUpRecommendations.get(appointment.id) ? (
                  <FollowUpBooking
                    recommendation={followUpRecommendations.get(
                      appointment.id,
                    )!}
                    options={
                      followUpOptions.get(
                        followUpRecommendations.get(appointment.id)!.id,
                      ) ?? []
                    }
                  />
                ) : null}
                {consultationNotes.get(appointment.id)?.status ===
                'FINALIZED' ? (
                  <p>
                    <a
                      href={`/api/patient/appointments/${appointment.id}/packet`}
                    >
                      Download my consultation packet
                    </a>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <p>
          <Link href="/patient">Back to patient area</Link>
        </p>
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Appointments</h1>
        <p>
          Appointments are unavailable. Complete patient onboarding before
          booking.
        </p>
        <p>
          <Link href="/patient">Back to patient area</Link>
        </p>
      </main>
    );
  }
}
