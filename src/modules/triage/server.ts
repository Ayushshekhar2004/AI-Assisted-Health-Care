import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { getSupabaseAdminConfig } from '@/lib/supabase/admin-config';
import { createClient } from '@/lib/supabase/server';
import {
  getIntakeSummaryForHandoff,
  type IntakeStructuredOutput,
} from '@/modules/intake/server';
import { intakeStructuredOutputSchema } from '@/modules/intake';

import { evaluateRedFlags } from './evaluate';
import { createSpecialtyRoutingModel } from './model-provider';
import {
  routeIntakeToSpecialty,
  type SpecialtyRoutingServiceResult,
} from './routing';
import {
  emergencyScreeningAnswersSchema,
  parseEmergencyScreeningAnswers,
} from './screening';
import {
  createSafeCareGuidance,
  isSafeCarePreResponseStatus,
  safeCareGuidanceSchema,
} from './safe-care';
import { createSafeCareClassificationModel } from './safe-care-model-provider';

const activeRedFlagSchema = z.object({
  id: z.string().uuid(),
  intakeSessionId: z.string().uuid(),
  evaluatedAt: z.string().datetime({ offset: true }),
});

const latestTriageResultSchema = activeRedFlagSchema.extend({
  outcome: z.enum(['NO_RED_FLAG', 'RED_FLAG']),
});

const emptyStructuredIntake: IntakeStructuredOutput = {
  chief_complaint: null,
  onset: null,
  duration: null,
  severity: null,
  associated_symptoms: [],
  relevant_history: [],
  current_medicines: [],
  allergies: [],
  pregnancy_possibility: {
    clinically_relevant: false,
    response: 'not_clinically_relevant',
  },
  missing_information: [
    'chief_complaint',
    'onset',
    'duration',
    'severity',
    'associated_symptoms',
    'relevant_history',
    'current_medicines',
    'allergies',
  ],
  follow_up_question: 'What brings you here today?',
  intake_complete: false,
};

export type ActiveRedFlag = z.infer<typeof activeRedFlagSchema>;
export type LatestTriageResult = z.infer<typeof latestTriageResultSchema>;
export type SafeCareWhileWaiting = z.infer<typeof safeCareGuidanceSchema>;

async function createAuthorizedPatientClient() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Triage is unavailable');

  const profile = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();
  if (profile.error || profile.data?.role !== 'patient') {
    throw new Error('Triage is unavailable');
  }
  return { supabase, userId: authData.user.id };
}

function createPrivilegedClient() {
  const { secretKey, url } = getSupabaseAdminConfig();
  return createSupabaseAdminClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getActiveRedFlag(): Promise<ActiveRedFlag | null> {
  const { supabase } = await createAuthorizedPatientClient();
  const { data, error } = await supabase
    .from('triage_results')
    .select('id, intake_session_id, evaluated_at')
    .eq('outcome', 'RED_FLAG')
    .order('evaluated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('Triage is unavailable');
  if (!data) return null;
  return activeRedFlagSchema.parse({
    id: data.id,
    intakeSessionId: data.intake_session_id,
    evaluatedAt: data.evaluated_at,
  });
}

export async function getLatestTriageResultForSession(
  intakeSessionId: unknown,
): Promise<LatestTriageResult | null> {
  const sessionId = z.string().uuid().parse(intakeSessionId);
  const { supabase } = await createAuthorizedPatientClient();
  const { data, error } = await supabase
    .from('triage_results')
    .select('id, intake_session_id, evaluated_at, outcome')
    .eq('intake_session_id', sessionId)
    .order('evaluated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('Triage is unavailable');
  if (!data) return null;
  return latestTriageResultSchema.parse({
    id: data.id,
    intakeSessionId: data.intake_session_id,
    evaluatedAt: data.evaluated_at,
    outcome: data.outcome,
  });
}

export async function evaluateEmergencyScreening(
  intakeSessionId: unknown,
  untrustedAnswers: unknown,
): Promise<ActiveRedFlag | null> {
  const sessionId = z.string().uuid().parse(intakeSessionId);
  const explicitAnswers = parseEmergencyScreeningAnswers(untrustedAnswers);
  const { userId } = await createAuthorizedPatientClient();
  const structuredIntake =
    (await getIntakeSummaryForHandoff(sessionId)) ?? emptyStructuredIntake;
  const result = evaluateRedFlags({ structuredIntake, explicitAnswers });
  const privileged = createPrivilegedClient();
  const { data, error } = await privileged.rpc(
    'record_triage_result_with_answers',
    {
      p_actor_user_id: userId,
      p_explicit_answers: explicitAnswers,
      p_intake_session_id: sessionId,
      p_matched_rule_codes: [...result.matchedRuleCodes],
      p_outcome: result.outcome,
      p_rule_set_version: result.ruleSetVersion,
    },
  );
  if (error) throw new Error('Triage is unavailable');
  if (!result.requiresEmergencyAction) return null;
  return activeRedFlagSchema.parse({
    id: data,
    intakeSessionId: sessionId,
    evaluatedAt: new Date().toISOString(),
  });
}

export async function recordEmergencyPathwayEntry(
  triageResultId: unknown,
): Promise<void> {
  const resultId = z.string().uuid().parse(triageResultId);
  const { supabase } = await createAuthorizedPatientClient();
  const { error } = await supabase.rpc('enter_triage_emergency_pathway', {
    p_triage_result_id: resultId,
  });
  if (error) throw new Error('Triage is unavailable');
}

export async function routeAndStoreIntakeSpecialty(
  intakeSessionId: unknown,
): Promise<SpecialtyRoutingServiceResult> {
  const sessionId = z.string().uuid().parse(intakeSessionId);
  const { supabase, userId } = await createAuthorizedPatientClient();
  const [structuredIntake, redFlagResult] = await Promise.all([
    getIntakeSummaryForHandoff(sessionId),
    supabase
      .from('triage_results')
      .select('id')
      .eq('intake_session_id', sessionId)
      .eq('outcome', 'RED_FLAG')
      .limit(1)
      .maybeSingle(),
  ]);
  if (redFlagResult.error) throw new Error('Routing is unavailable');

  const routing = await routeIntakeToSpecialty(createSpecialtyRoutingModel(), {
    structuredIntake: structuredIntake ?? emptyStructuredIntake,
    redFlagDetected: Boolean(redFlagResult.data),
  });

  const privileged = createPrivilegedClient();
  const { error } = await privileged.rpc('record_specialty_routing_result', {
    p_actor_user_id: userId,
    p_intake_session_id: sessionId,
    p_model_name: routing.modelName,
    p_model_output: routing.modelOutput,
    p_model_version: routing.modelVersion,
    p_prompt_version: routing.promptVersion,
    p_routing_policy_version: routing.routingPolicyVersion,
    p_routing_result: routing.routingResult,
    p_routing_schema_version: routing.routingSchemaVersion,
  });
  if (error) throw new Error('Routing is unavailable');
  return routing;
}

export async function getSafeCareWhileWaiting(): Promise<SafeCareWhileWaiting | null> {
  const { supabase, userId } = await createAuthorizedPatientClient();
  const completedIntake = await supabase
    .from('intake_sessions')
    .select('id')
    .eq('status', 'COMPLETED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sessionId = completedIntake.data?.id;
  if (completedIntake.error || !sessionId) return null;

  const latestAppointment = await supabase
    .from('appointments')
    .select('status')
    .eq('intake_session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestAppointment.error) {
    throw new Error('Safe care guidance is unavailable');
  }
  if (!isSafeCarePreResponseStatus(latestAppointment.data?.status ?? null)) {
    return null;
  }

  const existing = await supabase
    .from('safe_care_guidance_results')
    .select('guidance_snapshot')
    .eq('intake_session_id', sessionId)
    .maybeSingle();
  if (existing.error) throw new Error('Safe care guidance is unavailable');
  if (existing.data) {
    return safeCareGuidanceSchema.parse(existing.data.guidance_snapshot);
  }

  const [structuredResult, patientResult, redFlagResult] = await Promise.all([
    supabase
      .from('intake_structured')
      .select('structured_data')
      .eq('intake_session_id', sessionId)
      .maybeSingle(),
    supabase
      .from('patients')
      .select('date_of_birth, preferred_language')
      .maybeSingle(),
    supabase
      .from('triage_results')
      .select('explicit_answers, outcome')
      .eq('intake_session_id', sessionId)
      .order('evaluated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (
    structuredResult.error ||
    patientResult.error ||
    redFlagResult.error ||
    !structuredResult.data ||
    !patientResult.data?.date_of_birth ||
    !patientResult.data.preferred_language
  ) {
    throw new Error('Safe care guidance is unavailable');
  }

  const structuredIntake = intakeStructuredOutputSchema.parse(
    structuredResult.data.structured_data,
  );
  const parsedAnswers = emergencyScreeningAnswersSchema.safeParse(
    redFlagResult.data?.explicit_answers,
  );
  const explicitAnswers = parsedAnswers.success ? parsedAnswers.data : [];
  const completedEvaluation = evaluateRedFlags({
    structuredIntake,
    explicitAnswers,
  });
  const redFlagDetected =
    redFlagResult.data?.outcome === 'RED_FLAG' ||
    completedEvaluation.requiresEmergencyAction;
  const privileged = createPrivilegedClient();

  if (
    completedEvaluation.requiresEmergencyAction &&
    redFlagResult.data?.outcome !== 'RED_FLAG'
  ) {
    const { error } = await privileged.rpc('record_triage_result', {
      p_actor_user_id: userId,
      p_intake_session_id: sessionId,
      p_matched_rule_codes: [...completedEvaluation.matchedRuleCodes],
      p_outcome: 'RED_FLAG',
      p_rule_set_version: completedEvaluation.ruleSetVersion,
    });
    if (error) throw new Error('Safe care guidance is unavailable');
  }

  const guidance = await createSafeCareGuidance(
    createSafeCareClassificationModel(),
    {
      structuredIntake,
      language: patientResult.data.preferred_language,
      ageYears: calculateAgeYears(patientResult.data.date_of_birth),
      redFlagDetected,
    },
  );

  const { error } = await privileged.rpc('record_safe_care_guidance', {
    p_actor_user_id: userId,
    p_guidance: guidance,
    p_intake_session_id: sessionId,
  });
  if (error) throw new Error('Safe care guidance is unavailable');
  return guidance;
}

function calculateAgeYears(
  dateOfBirth: string,
  now: Date = new Date(),
): number {
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() &&
      now.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}
