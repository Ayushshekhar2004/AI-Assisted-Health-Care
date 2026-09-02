import { z } from 'zod';

const developmentUtilityEnvironmentSchema = z
  .object({
    APP_ENV: z.literal('development'),
    NODE_ENV: z.enum(['development', 'test']).default('development'),
    NEXT_PUBLIC_APP_ENV: z.literal('development'),
    NEXT_PUBLIC_SUPABASE_PROJECT_REF: z.literal('local'),
    NEXT_PUBLIC_RESOURCE_NAMESPACE: z.literal('development-local'),
  })
  .strict();

export function assertDevelopmentUtilityEnvironment(environment) {
  const parsed = developmentUtilityEnvironmentSchema.safeParse({
    APP_ENV: environment.APP_ENV,
    NODE_ENV: environment.NODE_ENV,
    NEXT_PUBLIC_APP_ENV: environment.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_SUPABASE_PROJECT_REF:
      environment.NEXT_PUBLIC_SUPABASE_PROJECT_REF,
    NEXT_PUBLIC_RESOURCE_NAMESPACE: environment.NEXT_PUBLIC_RESOURCE_NAMESPACE,
  });
  if (!parsed.success) {
    throw new Error(
      'Development utility blocked: environment is not the isolated local development project.',
    );
  }
  return parsed.data;
}
