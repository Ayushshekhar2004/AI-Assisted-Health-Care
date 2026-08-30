import Link from 'next/link';

import { LocalDateTime } from '@/app/_components/local-date-time';
import {
  listBookableSlots,
  listOwnPatientAppointments,
} from '@/modules/scheduling/server';

import { BookingForm } from './booking-form';

function formatFee(feePaise: number | null): string {
  return feePaise === null
    ? 'Fee not provided'
    : `₹${(feePaise / 100).toFixed(2)}`;
}

export default async function PatientAppointmentsPage() {
  try {
    const [slots, appointments] = await Promise.all([
      listBookableSlots(),
      listOwnPatientAppointments(),
    ]);

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
