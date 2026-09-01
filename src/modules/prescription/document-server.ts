import 'server-only';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getOwnConsultationNote } from '@/modules/consultation/server';
import { getOwnConsultationOutcome } from '@/modules/consultation/outcome-server';
import { getOwnPrescription } from './server';
import { createFinalizedConsultationPdf } from './document';

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
