import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { z } from 'zod';

const smokeEnvironmentSchema = z.object({
  APP_ENV: z.literal('staging'),
  STAGING_BASE_URL: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === 'https:'),
});

export async function runStagingSmokeTests(
  environment = process.env,
  fetchImplementation = fetch,
) {
  const { STAGING_BASE_URL } = smokeEnvironmentSchema.parse(environment);
  const baseUrl = new URL(STAGING_BASE_URL);
  const health = await fetchImplementation(new URL('/health', baseUrl), {
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!health.ok || JSON.stringify(await health.json()) !== '{"status":"ok"}') {
    throw new Error('Staging smoke test failed: liveness is unavailable.');
  }
  if (
    health.headers.get('cache-control') !== 'no-store, private' ||
    health.headers.get('x-content-type-options') !== 'nosniff'
  ) {
    throw new Error(
      'Staging smoke test failed: security headers are incomplete.',
    );
  }

  const login = await fetchImplementation(new URL('/auth/login', baseUrl), {
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!login.ok) {
    throw new Error(
      'Staging smoke test failed: authentication UI is unavailable.',
    );
  }

  const patient = await fetchImplementation(new URL('/patient', baseUrl), {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  const location = patient.headers.get('location');
  if (
    ![302, 307, 308].includes(patient.status) ||
    !location?.includes('/auth/login')
  ) {
    throw new Error(
      'Staging smoke test failed: protected routing is unavailable.',
    );
  }

  process.stdout.write('Staging public smoke tests passed.\n');
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  runStagingSmokeTests().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Staging smoke test failed.'}\n`,
    );
    process.exitCode = 1;
  });
}
