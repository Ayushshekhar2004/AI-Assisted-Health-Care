import { z } from 'zod';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';

import { getSupabaseAdminConfig } from '@/lib/supabase/admin-config';
import { createClient } from '@/lib/supabase/server';

import {
  INTAKE_STRUCTURED_SCHEMA_VERSION,
  intakeStructuredOutputSchema,
  orchestrateIntake,
  parseIntakeMessage,
  parseIntakeSessionId,
} from './index';
import { createIntakeModel } from './model-provider';
import { hasPendingPatientTurn } from './pending-turn';

const intakeSessionSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
});

const intakeMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['patient', 'assistant']),
  text: z.string().min(1).max(4000),
  createdAt: z.string().datetime({ offset: true }),
});

export type IntakeSession = z.infer<typeof intakeSessionSchema>;
export type IntakeMessage = z.infer<typeof intakeMessageSchema>;
export type { IntakeStructuredOutput } from './index';

async function createAuthorizedPatientClient() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Intake is unavailable');

  const profile = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (profile.error || profile.data?.role !== 'patient') {
    throw new Error('Intake is unavailable');
  }

  return { supabase, userId: authData.user.id };
}

function createPrivilegedClient() {
  const { secretKey, url } = getSupabaseAdminConfig();
  return createSupabaseAdminClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getActiveIntakeSession(): Promise<IntakeSession | null> {
  const { supabase } = await createAuthorizedPatientClient();
  const { data, error } = await supabase
    .from('intake_sessions')
    .select('id, created_at')
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (error) throw new Error('Intake is unavailable');
  if (!data) return null;
  return intakeSessionSchema.parse({ id: data.id, createdAt: data.created_at });
}

export async function listIntakeMessages(
  sessionIdInput: unknown,
): Promise<IntakeMessage[]> {
  const sessionId = parseIntakeSessionId(sessionIdInput);
  const { supabase } = await createAuthorizedPatientClient();
  const { data, error } = await supabase
    .from('intake_messages')
    .select('id, role, text_content, created_at')
    .eq('intake_session_id', sessionId)
    .order('sequence_number');

  if (error) throw new Error('Intake is unavailable');
  return z.array(intakeMessageSchema).parse(
    (data ?? []).map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text_content,
      createdAt: message.created_at,
    })),
  );
}

export async function getIntakeSummaryForHandoff(
  sessionIdInput: unknown,
): Promise<z.infer<typeof intakeStructuredOutputSchema> | null> {
  const sessionId = parseIntakeSessionId(sessionIdInput);
  const { supabase } = await createAuthorizedPatientClient();
  const session = await supabase
    .from('intake_sessions')
    .select('id')
    .eq('id', sessionId)
    .maybeSingle();
  if (session.error || !session.data) throw new Error('Intake is unavailable');
  const { data, error } = await supabase
    .from('intake_structured')
    .select('structured_data')
    .eq('intake_session_id', sessionId)
    .maybeSingle();
  if (error) throw new Error('Intake is unavailable');
  return data ? intakeStructuredOutputSchema.parse(data.structured_data) : null;
}

export async function startIntakeSession(): Promise<void> {
  const { supabase } = await createAuthorizedPatientClient();
  const { error } = await supabase.rpc('start_intake_session');
  if (error) throw new Error('Intake is unavailable');
}

export async function addIntakeMessage(
  sessionIdInput: unknown,
  textInput: unknown,
): Promise<void> {
  const sessionId = parseIntakeSessionId(sessionIdInput);
  const text = parseIntakeMessage(textInput);
  const { supabase, userId } = await createAuthorizedPatientClient();
  const latestMessage = await supabase
    .from('intake_messages')
    .select('role')
    .eq('intake_session_id', sessionId)
    .order('sequence_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestMessage.error) throw new Error('Intake is unavailable');

  if (!hasPendingPatientTurn(latestMessage.data?.role ?? null)) {
    const { error } = await supabase.rpc('add_intake_patient_message', {
      p_intake_session_id: sessionId,
      p_text_content: text,
    });
    if (error) throw new Error('Intake is unavailable');
  }

  const [messagesResult, structuredResult] = await Promise.all([
    supabase
      .from('intake_messages')
      .select('role, text_content')
      .eq('intake_session_id', sessionId)
      .order('sequence_number'),
    supabase
      .from('intake_structured')
      .select('structured_data')
      .eq('intake_session_id', sessionId)
      .maybeSingle(),
  ]);

  if (messagesResult.error || structuredResult.error) {
    throw new Error('Intake is unavailable');
  }

  const messages = z
    .array(
      z.object({
        role: z.enum(['patient', 'assistant']),
        text_content: z.string().min(1).max(4000),
      }),
    )
    .parse(messagesResult.data ?? [])
    .map((message) => ({ role: message.role, text: message.text_content }));
  const previousStructured = structuredResult.data
    ? intakeStructuredOutputSchema.parse(structuredResult.data.structured_data)
    : null;
  const turn = await orchestrateIntake(createIntakeModel(), {
    messages,
    previousStructured,
  });

  const privileged = createPrivilegedClient();
  const { error: recordError } = await privileged.rpc(
    'record_intake_assistant_turn',
    {
      p_actor_user_id: userId,
      p_assistant_text: turn.assistantText,
      p_intake_complete: turn.intakeComplete,
      p_intake_session_id: sessionId,
      p_schema_version: INTAKE_STRUCTURED_SCHEMA_VERSION,
      p_structured_data: turn.structured,
    },
  );
  if (recordError) throw new Error('Intake is unavailable');
}
