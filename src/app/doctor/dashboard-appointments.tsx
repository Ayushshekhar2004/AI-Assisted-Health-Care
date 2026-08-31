import Link from 'next/link';

import type { DoctorDashboardPage } from '@/modules/scheduling/server';

import { LocalDateTime } from '../_components/local-date-time';

const languageLabels = { en: 'English', hi: 'Hindi' } as const;

function pageHref(page: number, dashboard: DoctorDashboardPage): string {
  const parameters = new URLSearchParams({
    page: String(page),
    status: dashboard.query.status,
    timezoneOffsetMinutes: String(dashboard.query.timezoneOffsetMinutes),
    view: dashboard.query.view,
  });
  return `/doctor?${parameters.toString()}`;
}

export function DashboardAppointments({
  dashboard,
}: Readonly<{ dashboard: DoctorDashboardPage }>) {
  return (
    <section aria-labelledby="doctor-appointments">
      <h2 id="doctor-appointments">
        {dashboard.query.view === 'TODAY'
          ? "Today's appointments"
          : 'Upcoming appointments'}
      </h2>
      <p>
        Showing {dashboard.appointments.length} of {dashboard.totalCount}{' '}
        appointments. Times use your current device timezone.
      </p>
      {dashboard.appointments.length === 0 ? (
        <p>No appointments match these filters.</p>
      ) : (
        <ul className="doctor-dashboard-list">
          {dashboard.appointments.map((appointment) => (
            <li key={appointment.id}>
              <div className="doctor-dashboard-heading">
                <h3>{appointment.patientDisplayName}</h3>
                <span
                  className={`urgency-badge urgency-${appointment.urgency.toLowerCase()}`}
                >
                  {appointment.urgency.replaceAll('_', ' ')}
                </span>
              </div>
              <p>
                <LocalDateTime
                  endsAt={appointment.endsAt}
                  startsAt={appointment.startsAt}
                />
              </p>
              <dl className="doctor-dashboard-details">
                <div>
                  <dt>Language</dt>
                  <dd>{languageLabels[appointment.language]}</dd>
                </div>
                <div>
                  <dt>Intake</dt>
                  <dd>{appointment.intakeState.replaceAll('_', ' ')}</dd>
                </div>
                <div>
                  <dt>Appointment</dt>
                  <dd>{appointment.status.replaceAll('_', ' ')}</dd>
                </div>
              </dl>
              <p>
                <Link href={`/doctor/appointments/${appointment.id}`}>
                  View appointment details
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
      {dashboard.totalPages > 1 ? (
        <nav aria-label="Appointment pages" className="pagination">
          {dashboard.page > 1 ? (
            <Link href={pageHref(dashboard.page - 1, dashboard)}>Previous</Link>
          ) : null}
          <span>
            Page {dashboard.page} of {dashboard.totalPages}
          </span>
          {dashboard.page < dashboard.totalPages ? (
            <Link href={pageHref(dashboard.page + 1, dashboard)}>Next</Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
