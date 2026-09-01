import 'server-only';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getOwnConsultationNote } from '@/modules/consultation/server';
import { getOwnConsultationOutcome } from '@/modules/consultation/outcome-server';
import { intakeStructuredOutputSchema } from '@/modules/intake';
import { getOwnPrescription } from './server';
import {
  createFinalizedConsultationPdf,
  createPatientConsultationPacketPdf,
} from './document';

export async function generateOwnFinalizedDocument(input: unknown) {
  const appointmentId = z.string().uuid().parse(input);
  const [consultation, prescription, outcome] = await Promise.all([
    getOwnConsultationNote(appointmentId),
    getOwnPrescription(appointmentId),
    getOwnConsultationOutcome(appointmentId),
  ]);
  if (!consultation || consultation.status !== 'FINALIZED')
    throw new Error('Document is unavailable');
  const finalPrescription =
    prescription?.status === 'FINAL' ? prescription : null;
  const supabase = await createClient();
  const { error } = await supabase.rpc('audit_consultation_document', {
    p_appointment_id: appointmentId,
  });
  if (error) throw new Error('Document is unavailable');
  return createFinalizedConsultationPdf({
    appointmentId,
    consultation,
    prescription: finalPrescription,
    outcome,
  });
}

export async function generateOwnPatientConsultationPacket(input: unknown) {
  const appointmentId = z.string().uuid().parse(input);
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user)
    throw new Error('Consultation packet is unavailable');
  const profile = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', auth.data.user.id)
    .maybeSingle();
  if (profile.error || profile.data?.role !== 'patient')
    throw new Error('Consultation packet is unavailable');

  const appointment = await supabase
    .from('appointments')
    .select('intake_session_id')
    .eq('id', appointmentId)
    .maybeSingle();
  if (appointment.error || !appointment.data)
    throw new Error('Consultation packet is unavailable');
  const intake = appointment.data.intake_session_id
    ? await supabase
        .from('intake_structured')
        .select('structured_data')
        .eq('intake_session_id', appointment.data.intake_session_id)
        .maybeSingle()
    : null;
  if (intake?.error) throw new Error('Consultation packet is unavailable');

  const [consultation, prescription, outcome] = await Promise.all([
    getOwnConsultationNote(appointmentId),
    getOwnPrescription(appointmentId),
    getOwnConsultationOutcome(appointmentId),
  ]);
  if (!consultation || consultation.status !== 'FINALIZED')
    throw new Error('Consultation packet is unavailable');
  const finalPrescription =
    prescription?.status === 'FINAL' ? prescription : null;
  const audit = await supabase.rpc('audit_patient_consultation_packet', {
    p_appointment_id: appointmentId,
  });
  if (audit.error) throw new Error('Consultation packet is unavailable');

  return createPatientConsultationPacketPdf({
    appointmentId,
    consultation,
    prescription: finalPrescription,
    outcome,
    intake: intake?.data
      ? intakeStructuredOutputSchema.parse(intake.data.structured_data)
      : null,
  });
}
