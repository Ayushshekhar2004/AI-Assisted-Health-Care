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
import { getOwnPrescription } from '@/modules/prescription/server';
import { PrescriptionEditor } from './prescription-editor';
import { getOwnConsultationOutcome } from '@/modules/consultation/outcome-server';
import { OutcomeForm } from './outcome-form';
import { listAssignedAppointmentDocuments } from '@/modules/patient/document-server';
import { DoctorDocumentList } from './document-list';

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
    const prescription = await getOwnPrescription(appointmentId);
    const outcome = await getOwnConsultationOutcome(appointmentId);
    const documents = await listAssignedAppointmentDocuments(appointmentId);
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
        <DoctorDocumentList documents={documents} />
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
        <PrescriptionEditor
          appointmentId={appointmentId}
          prescription={prescription}
        />
        <OutcomeForm
          appointmentId={appointmentId}
          noteFinalized={consultationNote?.status === 'FINALIZED'}
          outcome={outcome}
        />
        {consultationNote?.status === 'FINALIZED' ? (
          <p>
            <a href={`/api/consultation/${appointmentId}/document`}>
              Download finalized consultation PDF
            </a>
          </p>
        ) : null}
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
