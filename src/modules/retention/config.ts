import 'server-only';

import { z } from 'zod';

const retentionJobConfigSchema = z.object({
  executionEnabled: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export function parseRetentionJobConfig(input: unknown) {
  return retentionJobConfigSchema.parse(input);
}

export function getRetentionJobConfig() {
  return parseRetentionJobConfig({
    executionEnabled: process.env.DATA_RETENTION_EXECUTION_ENABLED,
  });
}
