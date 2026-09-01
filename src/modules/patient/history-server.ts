import 'server-only';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

import {
  PATIENT_HISTORY_PAGE_SIZE,
  parsePatientHistoryQuery,
  patientHistoryItemSchema,
  type PatientHistoryItem,
} from './history';

type PatientHistoryRow = Readonly<{
  appointment_id: unknown;
  starts_at: unknown;
  ends_at: unknown;
  appointment_status: unknown;
  doctor_name: unknown;
  doctor_specialty: unknown;
  consultation_outcome: unknown;
  finalized_prescription: unknown;
  uploaded_documents: unknown;
  total_count: unknown;
}>;

export type PatientHistoryPage = Readonly<{
  items: PatientHistoryItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}>;

export async function listOwnPatientHistory(
  input: unknown,
): Promise<PatientHistoryPage> {
  const query = parsePatientHistoryQuery(input);
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    throw new Error('Patient history is unavailable');
  }

  const profile = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', auth.data.user.id)
    .maybeSingle();
  if (profile.error || profile.data?.role !== 'patient') {
    throw new Error('Patient history is unavailable');
  }

  const result = await supabase.rpc('list_patient_history', {
    p_limit: PATIENT_HISTORY_PAGE_SIZE,
    p_offset: (query.page - 1) * PATIENT_HISTORY_PAGE_SIZE,
  });
  if (result.error) throw new Error('Patient history is unavailable');

  const rows = (result.data ?? []) as PatientHistoryRow[];
  const items = z.array(patientHistoryItemSchema).parse(
    rows.map((row) => ({
      appointmentId: row.appointment_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.appointment_status,
      doctorName: row.doctor_name,
      doctorSpecialty: row.doctor_specialty,
      outcome: row.consultation_outcome,
      prescription: row.finalized_prescription,
      documents: row.uploaded_documents,
    })),
  );
  const totalCount = z.coerce
    .number()
    .int()
    .nonnegative()
    .parse(rows[0]?.total_count ?? 0);

  return {
    items,
    page: query.page,
    pageSize: PATIENT_HISTORY_PAGE_SIZE,
    totalCount,
    totalPages: Math.ceil(totalCount / PATIENT_HISTORY_PAGE_SIZE),
  };
}
