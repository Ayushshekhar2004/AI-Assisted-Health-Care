import 'server-only';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  consultationOutcomeInputSchema,
  consultationOutcomeSchema,
  type ConsultationOutcome,
} from './outcome';

export async function recordConsultationOutcome(input: unknown): Promise<void> {
  const value = consultationOutcomeInputSchema.parse(input);
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user)
    throw new Error('Consultation outcome is unavailable');
  const { error } = await supabase.rpc('record_consultation_outcome', {
    p_appointment_id: value.appointmentId,
    p_outcome: value.outcome,
    p_referral_specialty: value.referralSpecialty || null,
    p_clinic_location: value.clinicLocation || null,
    p_location_instructions: value.locationInstructions || null,
    p_appointment_note: value.appointmentNote || null,
  });
  if (error) throw new Error('Consultation outcome is unavailable');
}

export async function getOwnConsultationOutcome(
  id: unknown,
): Promise<ConsultationOutcome | null> {
  const appointmentId = z.string().uuid().parse(id);
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user)
    throw new Error('Consultation outcome is unavailable');
  const { data, error } = await supabase.rpc('get_own_consultation_outcome', {
    p_appointment_id: appointmentId,
  });
  if (error) throw new Error('Consultation outcome is unavailable');
  if (!data?.length) return null;
  const row = data[0];
  return consultationOutcomeSchema.parse({
    id: row.id,
    appointmentId: row.appointment_id,
    outcome: row.outcome,
    referralSpecialty: row.referral_specialty,
    clinicLocation: row.clinic_location,
    locationInstructions: row.location_instructions,
    appointmentNote: row.appointment_note,
    recordedAt: row.recorded_at,
  });
}
