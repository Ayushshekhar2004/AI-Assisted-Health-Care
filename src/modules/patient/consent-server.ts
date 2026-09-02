import 'server-only';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

import {
  consentDecisionInputSchema,
  consentVersions,
  patientConsentRecordSchema,
  type PatientConsentRecord,
} from './consent';

type ConsentRow = Readonly<{
  id: unknown;
  consent_type: unknown;
  status: unknown;
  policy_version: unknown;
  effective_at: unknown;
}>;

export async function listOwnManagedConsents(): Promise<
  PatientConsentRecord[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('list_own_managed_consents');
  if (error) throw new Error('Consent preferences are unavailable');
  return z.array(patientConsentRecordSchema).parse(
    (data ?? []).map((row: ConsentRow) => ({
      id: row.id,
      purpose: row.consent_type,
      status: row.status,
      policyVersion: row.policy_version,
      effectiveAt: row.effective_at,
    })),
  );
}

export async function recordOwnConsentDecision(input: unknown): Promise<void> {
  const value = consentDecisionInputSchema.parse(input);
  const { [value.purpose]: policyVersion } = consentVersions;
  const supabase = await createClient();
  const { error } = await supabase.rpc('record_patient_consent_decision', {
    p_consent_type: value.purpose,
    p_policy_version: policyVersion,
    p_status: value.status,
  });
  if (error) throw new Error('Consent preferences are unavailable');
}
