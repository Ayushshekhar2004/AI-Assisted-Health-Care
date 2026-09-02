import { describe, expect, it } from 'vitest';

import { assertDevelopmentUtilityEnvironment } from './development-guard.mjs';

const developmentEnvironment = {
  APP_ENV: 'development',
  NODE_ENV: 'development',
  NEXT_PUBLIC_APP_ENV: 'development',
  NEXT_PUBLIC_SUPABASE_PROJECT_REF: 'local',
  NEXT_PUBLIC_RESOURCE_NAMESPACE: 'development-local',
};

describe('development utility environment guard', () => {
  it('accepts only the isolated local development environment', () => {
    expect(assertDevelopmentUtilityEnvironment(developmentEnvironment)).toEqual(
      developmentEnvironment,
    );
  });

  it.each(['staging', 'production'])(
    'rejects the %s environment',
    (appEnvironment) => {
      expect(() =>
        assertDevelopmentUtilityEnvironment({
          ...developmentEnvironment,
          APP_ENV: appEnvironment,
          NEXT_PUBLIC_APP_ENV: appEnvironment,
        }),
      ).toThrow('Development utility blocked');
    },
  );

  it('rejects NODE_ENV production even with a forged development marker', () => {
    expect(() =>
      assertDevelopmentUtilityEnvironment({
        ...developmentEnvironment,
        NODE_ENV: 'production',
      }),
    ).toThrow('Development utility blocked');
  });

  it('rejects hosted project markers', () => {
    expect(() =>
      assertDevelopmentUtilityEnvironment({
        ...developmentEnvironment,
        NEXT_PUBLIC_SUPABASE_PROJECT_REF: 'stagingproject',
      }),
    ).toThrow('Development utility blocked');
  });
});
