import { describe, expect, it } from 'vitest';

import { assertStagingMigrationEnvironment } from './migrate-staging.mjs';

const staging = {
  APP_ENV: 'staging',
  NEXT_PUBLIC_APP_ENV: 'staging',
  NEXT_PUBLIC_SUPABASE_PROJECT_REF: 'stagingref1',
  NEXT_PUBLIC_RESOURCE_NAMESPACE: 'staging-stagingref1',
  NEXT_PUBLIC_SUPABASE_URL: 'https://stagingref1.supabase.co',
  PRODUCTION_SUPABASE_PROJECT_REF: 'productionref1',
  STAGING_MIGRATION_CONFIRM: 'APPLY_TO_stagingref1',
  SUPABASE_ACCESS_TOKEN: 'synthetic-access-token-value',
  SUPABASE_DB_PASSWORD: 'synthetic-password',
};

describe('controlled staging migration guard', () => {
  it('accepts an explicitly confirmed isolated staging project', () => {
    expect(assertStagingMigrationEnvironment(staging)).toMatchObject({
      NEXT_PUBLIC_SUPABASE_PROJECT_REF: 'stagingref1',
    });
  });

  it('rejects production and development environments', () => {
    expect(() =>
      assertStagingMigrationEnvironment({ ...staging, APP_ENV: 'production' }),
    ).toThrow('Staging migration blocked');
    expect(() =>
      assertStagingMigrationEnvironment({ ...staging, APP_ENV: 'development' }),
    ).toThrow('Staging migration blocked');
  });

  it('rejects the production project and mismatched confirmations', () => {
    expect(() =>
      assertStagingMigrationEnvironment({
        ...staging,
        PRODUCTION_SUPABASE_PROJECT_REF: 'stagingref1',
      }),
    ).toThrow('Staging migration blocked');
    expect(() =>
      assertStagingMigrationEnvironment({
        ...staging,
        STAGING_MIGRATION_CONFIRM: 'APPLY_TO_otherproject',
      }),
    ).toThrow('Staging migration blocked');
  });
});
