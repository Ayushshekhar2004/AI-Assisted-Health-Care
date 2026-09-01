import { describe, expect, it } from 'vitest';

import { parseNotificationProviderEnvironment } from './provider-config';

describe('notification provider configuration', () => {
  it('selects the development provider by default outside production', () => {
    expect(parseNotificationProviderEnvironment({ NODE_ENV: 'test' })).toEqual({
      NODE_ENV: 'test',
      NOTIFICATION_PROVIDER: 'development',
    });
  });

  it('rejects unsupported providers', () => {
    expect(() =>
      parseNotificationProviderEnvironment({
        NODE_ENV: 'development',
        NOTIFICATION_PROVIDER: 'sms',
      }),
    ).toThrow();
  });

  it('rejects the no-op development provider in production', () => {
    expect(() =>
      parseNotificationProviderEnvironment({
        NODE_ENV: 'production',
        NOTIFICATION_PROVIDER: 'development',
      }),
    ).toThrow();
  });
});
