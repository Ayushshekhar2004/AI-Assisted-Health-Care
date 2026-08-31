import 'server-only';

import { createHmac } from 'node:crypto';

import OpenAI from 'openai';

import { createClient } from '@/lib/supabase/server';

import { getOpenAIRealtimeConfig } from './openai-realtime-config';
import {
  buildRealtimeTranscriptionSession,
  parseRealtimeSessionRequest,
  type RealtimeSessionRequest,
} from './realtime';

export type RealtimeClientSecret = Readonly<{
  value: string;
  expiresAt: number;
}>;

async function authorizeActiveIntakeSession(input: RealtimeSessionRequest) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user)
    throw new Error('Voice input is unavailable');

  const profile = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();
  if (profile.error || profile.data?.role !== 'patient') {
    throw new Error('Voice input is unavailable');
  }

  const [session, redFlag] = await Promise.all([
    supabase
      .from('intake_sessions')
      .select('id')
      .eq('id', input.sessionId)
      .eq('status', 'ACTIVE')
      .maybeSingle(),
    supabase
      .from('triage_results')
      .select('id')
      .eq('intake_session_id', input.sessionId)
      .eq('outcome', 'RED_FLAG')
      .limit(1)
      .maybeSingle(),
  ]);
  if (session.error || !session.data || redFlag.error || redFlag.data) {
    throw new Error('Voice input is unavailable');
  }

  return { supabase, userId: authData.user.id };
}

export async function createIntakeRealtimeClientSecret(
  untrustedInput: unknown,
): Promise<RealtimeClientSecret> {
  const input = parseRealtimeSessionRequest(untrustedInput);
  const { supabase, userId } = await authorizeActiveIntakeSession(input);
  const { apiKey, model } = getOpenAIRealtimeConfig();
  const safetyIdentifier = createHmac('sha256', apiKey)
    .update(userId)
    .digest('hex');
  const client = new OpenAI({ apiKey });
  const secret = await client.realtime.clientSecrets.create(
    {
      expires_after: { anchor: 'created_at', seconds: 60 },
      session: buildRealtimeTranscriptionSession(input.language, model),
    },
    { headers: { 'OpenAI-Safety-Identifier': safetyIdentifier } },
  );

  const { error: auditError } = await supabase.rpc(
    'record_intake_voice_session_issued',
    {
      p_intake_session_id: input.sessionId,
    },
  );
  if (auditError) throw new Error('Voice input is unavailable');

  return { value: secret.value, expiresAt: secret.expires_at };
}
