import { describe, expect, it, vi } from 'vitest';

import { runStagingSmokeTests } from './smoke-staging.mjs';

function response(status: number, body: unknown, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('staging smoke tests', () => {
  it('checks liveness, security headers, auth UI, and protected routing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          200,
          { status: 'ok' },
          {
            'cache-control': 'no-store, private',
            'x-content-type-options': 'nosniff',
          },
        ),
      )
      .mockResolvedValueOnce(response(200, 'login'))
      .mockResolvedValueOnce(
        response(307, null, { location: '/auth/login?next=%2Fpatient' }),
      );
    await expect(
      runStagingSmokeTests(
        {
          APP_ENV: 'staging',
          STAGING_BASE_URL: 'https://staging.example.invalid',
        },
        fetchMock,
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects non-TLS staging targets before network access', async () => {
    const fetchMock = vi.fn();
    await expect(
      runStagingSmokeTests(
        {
          APP_ENV: 'staging',
          STAGING_BASE_URL: 'http://staging.example.invalid',
        },
        fetchMock,
      ),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
