import { z } from 'zod';

const monitoringConfigSchema = z
  .object({
    nodeEnvironment: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    hashSalt: z.string().min(32).optional(),
  })
  .superRefine((value, context) => {
    if (value.nodeEnvironment === 'production' && !value.hashSalt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Monitoring hash salt is required in production',
        path: ['hashSalt'],
      });
    }
  });

export function parseMonitoringConfig(input: {
  nodeEnvironment?: string;
  hashSalt?: string;
}) {
  return monitoringConfigSchema.parse(input);
}

export function getMonitoringConfig() {
  const hashSalt = process.env.MONITORING_HASH_SALT;
  return parseMonitoringConfig({
    nodeEnvironment: process.env.NODE_ENV,
    ...(hashSalt ? { hashSalt } : {}),
  });
}
