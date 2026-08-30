import 'server-only';

import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { getSupabaseAdminConfig } from '@/lib/supabase/admin-config';
import { createClient as createUserClient } from '@/lib/supabase/server';

import {
  doctorVerificationStateSchema,
  type DoctorVerificationState,
  type VerificationDecision,
  verificationDecisionSchema,
} from './verification-validation';

const queueEntrySchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  qualification: z.string(),
  registrationNumber: z.string(),
  registrationCouncil: z.string(),
  registrationState: z.string(),
  specialty: z.string(),
  languages: z.array(z.enum(['en', 'hi'])),
  teleconsultationFeePaise: z.number().int().nullable(),
  clinicCity: z.string().nullable(),
  clinicAddress: z.string().nullable(),
  hasProfilePhoto: z.boolean(),
});

export type DoctorVerificationQueueEntry = z.infer<typeof queueEntrySchema>;

async function requireOperationsActor(): Promise<string> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('Administrative verification is unavailable');
  }

  const profile = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', data.user.id)
    .maybeSingle();

  if (profile.error || profile.data?.role !== 'operations') {
    throw new Error('Administrative verification is unavailable');
  }

  return data.user.id;
}

function createPrivilegedClient() {
  const { secretKey, url } = getSupabaseAdminConfig();
  return createSupabaseAdminClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function listDoctorVerificationQueue(): Promise<
  DoctorVerificationQueueEntry[]
> {
  await requireOperationsActor();
  const admin = createPrivilegedClient();
  const { data, error } = await admin
    .from('doctors')
    .select(
      'id, full_name, qualification, registration_number, registration_council, registration_state, specialty, languages, teleconsultation_fee_paise, clinic_city, clinic_address, profile_photo_object_path',
    )
    .eq('status', 'pending_verification')
    .not('onboarding_completed_at', 'is', null)
    .order('onboarding_completed_at', { ascending: true });

  if (error) {
    throw new Error('Unable to load doctor verification queue');
  }

  return z.array(queueEntrySchema).parse(
    (data ?? []).map((doctor) => ({
      id: doctor.id,
      fullName: doctor.full_name,
      qualification: doctor.qualification,
      registrationNumber: doctor.registration_number,
      registrationCouncil: doctor.registration_council,
      registrationState: doctor.registration_state,
      specialty: doctor.specialty,
      languages: doctor.languages,
      teleconsultationFeePaise: doctor.teleconsultation_fee_paise,
      clinicCity: doctor.clinic_city,
      clinicAddress: doctor.clinic_address,
      hasProfilePhoto: doctor.profile_photo_object_path !== null,
    })),
  );
}

export async function transitionDoctorVerification(
  input: VerificationDecision,
): Promise<void> {
  const decision = verificationDecisionSchema.parse(input);
  const actorUserId = await requireOperationsActor();
  const admin = createPrivilegedClient();
  const { error } = await admin.rpc('transition_doctor_verification', {
    p_actor_user_id: actorUserId,
    p_decision: decision.decision,
    p_doctor_id: decision.doctorId,
    p_reason: decision.reason,
  });

  if (error) {
    throw new Error('Unable to transition doctor verification');
  }
}

export async function getOwnDoctorVerificationState(): Promise<DoctorVerificationState | null> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from('doctors')
    .select(
      'status, verification_reason, verification_decided_at, is_bookable, onboarding_completed_at',
    )
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return doctorVerificationStateSchema.parse({
    status: data.status,
    reason: data.verification_reason,
    decidedAt: data.verification_decided_at,
    isBookable: data.is_bookable,
    onboardingCompletedAt: data.onboarding_completed_at,
  });
}
