import 'server-only';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

import {
  followUpRecommendationInputSchema,
  followUpRecommendationSchema,
  type FollowUpRecommendation,
} from './follow-up';

type RecommendationRow = Readonly<{
  id: unknown;
  source_appointment_id: unknown;
  doctor_name: unknown;
  timing: unknown;
  created_at: unknown;
  booked_appointment_id: unknown;
}>;

function parseRecommendation(row: RecommendationRow): FollowUpRecommendation {
  return followUpRecommendationSchema.parse({
    id: row.id,
    sourceAppointmentId: row.source_appointment_id,
    doctorName: row.doctor_name,
    timing: row.timing,
    createdAt: row.created_at,
    bookedAppointmentId: row.booked_appointment_id,
  });
}

export async function createFollowUpRecommendation(
  input: unknown,
): Promise<void> {
  const value = followUpRecommendationInputSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc('create_follow_up_recommendation', {
    p_appointment_id: value.appointmentId,
    p_timing: value.timing,
  });
  if (error) throw new Error('Follow-up recommendation is unavailable');
}

export async function getOwnFollowUpRecommendation(
  appointmentIdInput: unknown,
): Promise<FollowUpRecommendation | null> {
  const appointmentId = z.string().uuid().parse(appointmentIdInput);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_follow_up_recommendation', {
    p_appointment_id: appointmentId,
  });
  if (error) throw new Error('Follow-up recommendation is unavailable');
  const row = data?.[0] as RecommendationRow | undefined;
  return row ? parseRecommendation(row) : null;
}
