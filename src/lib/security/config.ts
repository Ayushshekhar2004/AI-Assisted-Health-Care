import { z } from 'zod';

const securityConfigSchema = z
  .object({
    nodeEnvironment: z.enum(['development', 'test', 'production']),
    rateLimitSalt: z.string().min(32).max(256).optional(),
  })
  .superRefine((value, context) => {
    if (value.nodeEnvironment === 'production' && !value.rateLimitSalt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'RATE_LIMIT_SALT is required in production',
        path: ['rateLimitSalt'],
      });
    }
  });

export function parseSecurityConfig(input: unknown) {
  return securityConfigSchema.parse(input);
}

export function getSecurityConfig() {
  return parseSecurityConfig({
    nodeEnvironment: process.env.NODE_ENV ?? 'development',
    rateLimitSalt: process.env.RATE_LIMIT_SALT,
  });
}
