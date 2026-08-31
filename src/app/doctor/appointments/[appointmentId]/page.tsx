import Link from 'next/link';

import {
  getDoctorAppointmentDetail,
  getDoctorAppointmentHandoff,
  getDoctorHandoffInaccurateItems,
  getOwnConsultationNote,
} from '@/modules/consultation/server';

import { AppointmentDetail } from './appointment-detail';
import { HandoffPanel } from './handoff-panel';
import { ConsultationNoteForm } from './consultation-note-form';

type PageProps = Readonly<{
  params: Promise<{ appointmentId: string }>;
}>;

export default async function DoctorAppointmentDetailPage({
  params,
}: PageProps) {
  try {
    const appointmentId = (await params).appointmentId;
    const detail = await getDoctorAppointmentDetail(appointmentId);
    const consultationNote = await getOwnConsultationNote(appointmentId);
    const handoff = await getDoctorAppointmentHandoff(appointmentId);
    const inaccurateItemKeys = handoff
      ? await getDoctorHandoffInaccurateItems(
          appointmentId,
          handoff.summaryVersion,
        )
      : [];
    return (
      <main>
        <h1>Appointment details</h1>
        <AppointmentDetail detail={detail} />
        <HandoffPanel
          appointmentId={appointmentId}
          initialHandoff={handoff}
          initialInaccurateItemKeys={inaccurateItemKeys}
        />
        <ConsultationNoteForm
          appointmentId={appointmentId}
          appointmentStatus={detail.status}
          note={consultationNote}
        />
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
