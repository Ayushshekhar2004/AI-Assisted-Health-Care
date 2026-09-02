import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { z } from 'zod';

const stagingMigrationEnvironmentSchema = z
  .object({
    APP_ENV: z.literal('staging'),
    NEXT_PUBLIC_APP_ENV: z.literal('staging'),
    NEXT_PUBLIC_SUPABASE_PROJECT_REF: z.string().regex(/^[a-z0-9]{8,40}$/),
    NEXT_PUBLIC_RESOURCE_NAMESPACE: z.string(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    PRODUCTION_SUPABASE_PROJECT_REF: z
      .string()
      .regex(/^[a-z0-9]{8,40}$/)
      .optional(),
    STAGING_MIGRATION_CONFIRM: z.string(),
    SUPABASE_ACCESS_TOKEN: z.string().min(20),
    SUPABASE_DB_PASSWORD: z.string().min(8),
  })
  .strict()
  .superRefine((value, context) => {
    const projectRef = value.NEXT_PUBLIC_SUPABASE_PROJECT_REF;
    const url = new URL(value.NEXT_PUBLIC_SUPABASE_URL);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== `${projectRef}.supabase.co` ||
      value.NEXT_PUBLIC_RESOURCE_NAMESPACE !== `staging-${projectRef}`
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Staging project markers do not match',
      });
    }
    if (value.PRODUCTION_SUPABASE_PROJECT_REF === projectRef) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Staging must not use the production project',
      });
    }
    if (value.STAGING_MIGRATION_CONFIRM !== `APPLY_TO_${projectRef}`) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Staging migration confirmation does not match the project',
      });
    }
  });

export function assertStagingMigrationEnvironment(environment) {
  const parsed = stagingMigrationEnvironmentSchema.safeParse({
    APP_ENV: environment.APP_ENV,
    NEXT_PUBLIC_APP_ENV: environment.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_SUPABASE_PROJECT_REF:
      environment.NEXT_PUBLIC_SUPABASE_PROJECT_REF,
    NEXT_PUBLIC_RESOURCE_NAMESPACE: environment.NEXT_PUBLIC_RESOURCE_NAMESPACE,
    NEXT_PUBLIC_SUPABASE_URL: environment.NEXT_PUBLIC_SUPABASE_URL,
    ...(environment.PRODUCTION_SUPABASE_PROJECT_REF
      ? {
          PRODUCTION_SUPABASE_PROJECT_REF:
            environment.PRODUCTION_SUPABASE_PROJECT_REF,
        }
      : {}),
    STAGING_MIGRATION_CONFIRM: environment.STAGING_MIGRATION_CONFIRM,
    SUPABASE_ACCESS_TOKEN: environment.SUPABASE_ACCESS_TOKEN,
    SUPABASE_DB_PASSWORD: environment.SUPABASE_DB_PASSWORD,
  });
  if (!parsed.success) {
    throw new Error(
      'Staging migration blocked: verify isolated project markers, credentials, and project-specific confirmation.',
    );
  }
  return parsed.data;
}

export function runStagingMigrations(environment = process.env) {
  const config = assertStagingMigrationEnvironment(environment);
  const run = (arguments_) =>
    execFileSync('npx', ['supabase', ...arguments_], {
      env: environment,
      stdio: 'inherit',
    });

  run(['link', '--project-ref', config.NEXT_PUBLIC_SUPABASE_PROJECT_REF]);
  run(['db', 'push', '--linked', '--dry-run']);
  run(['db', 'push', '--linked']);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    runStagingMigrations();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Staging migration failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
