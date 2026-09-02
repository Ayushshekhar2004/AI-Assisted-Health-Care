import 'server-only';

import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { getSupabaseAdminConfig } from '@/lib/supabase/admin-config';

import { getRetentionJobConfig } from './config';
import { DATA_RETENTION_POLICY_VERSION } from './policy';

const retentionJobInputSchema = z
  .object({
    mode: z.enum(['DRY_RUN', 'APPLY']).default('DRY_RUN'),
    now: z.coerce.date().default(() => new Date()),
    batchSize: z.number().int().min(1).max(500).default(100),
  })
  .strict();

const databaseResultSchema = z.object({
  anonymized_operational_rows: z.coerce.number().int().nonnegative(),
  deleted_operational_rows: z.coerce.number().int().nonnegative(),
});

const temporaryObjectSchema = z.object({
  object_path: z
    .string()
    .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/),
});

export type DataRetentionJobResult = Readonly<{
  mode: 'DRY_RUN' | 'APPLY';
  policyVersion: string;
  anonymizedOperationalRows: number;
  deletedOperationalRows: number;
  disposableTemporaryFiles: number;
}>;

export async function runDataRetentionJob(
  untrustedInput: unknown,
): Promise<DataRetentionJobResult> {
  const input = retentionJobInputSchema.parse(untrustedInput);
  const { executionEnabled } = getRetentionJobConfig();
  if (input.mode === 'APPLY' && !executionEnabled) {
    throw new Error('Data retention execution is disabled');
  }

  const { secretKey, url } = getSupabaseAdminConfig();
  const privileged = createSupabaseAdminClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const database = await privileged.rpc('run_data_retention', {
    p_apply: input.mode === 'APPLY',
    p_batch_size: input.batchSize,
    p_now: input.now.toISOString(),
    p_policy_version: DATA_RETENTION_POLICY_VERSION,
  });
  if (database.error || !database.data?.[0]) {
    throw new Error('Data retention job is unavailable');
  }
  const result = databaseResultSchema.parse(database.data[0]);

  const temporaryFiles = await privileged.rpc(
    'list_expired_unregistered_document_objects',
    {
      p_batch_size: input.batchSize,
      p_now: input.now.toISOString(),
      p_policy_version: DATA_RETENTION_POLICY_VERSION,
    },
  );
  if (temporaryFiles.error)
    throw new Error('Data retention job is unavailable');
  const objects = z
    .array(temporaryObjectSchema)
    .parse(temporaryFiles.data ?? []);

  if (input.mode === 'APPLY' && objects.length > 0) {
    const removal = await privileged.storage
      .from('patient-documents')
      .remove(objects.map((object) => object.object_path));
    if (removal.error || removal.data.length !== objects.length) {
      throw new Error('Data retention job is unavailable');
    }
  }

  return {
    mode: input.mode,
    policyVersion: DATA_RETENTION_POLICY_VERSION,
    anonymizedOperationalRows: result.anonymized_operational_rows,
    deletedOperationalRows: result.deleted_operational_rows,
    disposableTemporaryFiles: objects.length,
  };
}
