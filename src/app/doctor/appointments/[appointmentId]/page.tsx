import Link from 'next/link';

import { getDoctorAppointmentDetail } from '@/modules/consultation/server';

import { AppointmentDetail } from './appointment-detail';

type PageProps = Readonly<{
  params: Promise<{ appointmentId: string }>;
}>;

export default async function DoctorAppointmentDetailPage({
  params,
}: PageProps) {
  try {
    const detail = await getDoctorAppointmentDetail(
      (await params).appointmentId,
    );
    return (
      <main>
        <h1>Appointment details</h1>
        <AppointmentDetail detail={detail} />
        <p>
          <Link href="/doctor">Back to doctor dashboard</Link>
        </p>
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Appointment details</h1>
        <p>This appointment is unavailable.</p>
        <p>
          <Link href="/doctor">Back to doctor dashboard</Link>
        </p>
      </main>
    );
  }
}
