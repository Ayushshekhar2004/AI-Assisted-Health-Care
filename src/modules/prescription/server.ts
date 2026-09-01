import 'server-only';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  prescriptionInputSchema,
  prescriptionSchema,
  type Prescription,
} from './validation';

async function authorizedClient(requiredRole?: 'doctor') {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user)
    throw new Error('Prescription is unavailable');
  if (requiredRole) {
    const profile = await supabase
      .from('profiles')
      .select('role')
      .eq('auth_user_id', authData.user.id)
      .maybeSingle();
    if (profile.error || profile.data?.role !== requiredRole) {
      throw new Error('Prescription is unavailable');
    }
  }
  return supabase;
}

function dbItems(items: z.infer<typeof prescriptionInputSchema>['items']) {
  return items.map((item) => ({
    item_type: item.itemType,
    item_name: item.itemName,
    dosage: item.dosage,
    frequency: item.frequency,
    duration: item.duration,
    instructions: item.instructions,
  }));
}

export async function savePrescription(
  input: unknown,
  finalize = false,
): Promise<void> {
  const prescription = prescriptionInputSchema.parse(input);
  if (finalize && prescription.items.length === 0)
    throw new Error('Prescription is unavailable');
  const supabase = await authorizedClient('doctor');
  const { error } = await supabase.rpc('write_prescription', {
    p_appointment_id: prescription.appointmentId,
    p_follow_up: prescription.followUp,
    p_items: dbItems(prescription.items),
    p_finalize: finalize,
  });
  if (error) throw new Error('Prescription is unavailable');
}

export async function getOwnPrescription(
  appointmentIdInput: unknown,
): Promise<Prescription | null> {
  const appointmentId = z.string().uuid().parse(appointmentIdInput);
  const supabase = await authorizedClient();
  const { data, error } = await supabase.rpc('get_own_prescription', {
    p_appointment_id: appointmentId,
  });
  if (error) throw new Error('Prescription is unavailable');
  if (!data?.length) return null;
  const prescription = data[0].prescription_data;
  const items = data[0].items_data;
  return prescriptionSchema.parse({
    id: prescription.id,
    appointmentId: prescription.appointment_id,
    patientId: prescription.patient_id,
    doctorId: prescription.doctor_id,
    doctorName: prescription.doctor_name,
    registrationNumber: prescription.doctor_registration_number,
    registrationCouncil: prescription.doctor_registration_council,
    registrationState: prescription.doctor_registration_state,
    prescriptionDate: prescription.prescription_date,
    followUp: prescription.follow_up,
    status: prescription.status,
    finalizedAt: prescription.finalized_at,
    items: items.map((item: Record<string, unknown>) => ({
      id: item.id,
      itemType: item.item_type,
      itemName: item.item_name,
      dosage: item.dosage,
      frequency: item.frequency,
      duration: item.duration,
      instructions: item.instructions,
      sortOrder: item.sort_order,
    })),
  });
}
