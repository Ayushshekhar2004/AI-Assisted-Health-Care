import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

export const DEMO_SEED_CONFIRMATION = 'LOCAL_DEMO_ONLY';

const localStatusSchema = z.object({
  API_URL: z.string().url(),
  DB_URL: z.string().url(),
});

function isLoopbackHostname(hostname) {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  );
}

export function assertLocalDemoSeedTarget(input) {
  if (input.confirmation !== DEMO_SEED_CONFIRMATION) {
    throw new Error(
      `Demo seed blocked: set DEMO_SEED_CONFIRM=${DEMO_SEED_CONFIRMATION} explicitly.`,
    );
  }

  const status = localStatusSchema.parse(input.status);
  const apiUrl = new URL(status.API_URL);
  const databaseUrl = new URL(status.DB_URL);
  if (
    apiUrl.protocol !== 'http:' ||
    databaseUrl.protocol !== 'postgresql:' ||
    !isLoopbackHostname(apiUrl.hostname) ||
    !isLoopbackHostname(databaseUrl.hostname)
  ) {
    throw new Error(
      'Demo seed blocked: only the loopback Supabase stack is allowed.',
    );
  }

  return status;
}

export function selectLocalDatabaseContainer(containerNames) {
  const matches = containerNames
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name.startsWith('supabase_db_'));
  if (matches.length !== 1) {
    throw new Error(
      'Demo seed blocked: expected exactly one local Supabase database container.',
    );
  }
  return matches[0];
}

export function runDemoSeed(environment = process.env) {
  if (environment.DEMO_SEED_CONFIRM !== DEMO_SEED_CONFIRMATION) {
    throw new Error(
      `Demo seed blocked: set DEMO_SEED_CONFIRM=${DEMO_SEED_CONFIRMATION} explicitly.`,
    );
  }
  const statusOutput = execFileSync(
    'npx',
    ['supabase', 'status', '-o', 'json'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  const status = JSON.parse(statusOutput);
  assertLocalDemoSeedTarget({
    confirmation: environment.DEMO_SEED_CONFIRM,
    status,
  });

  const containerOutput = execFileSync(
    'docker',
    ['ps', '--format', '{{.Names}}'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const container = selectLocalDatabaseContainer(containerOutput);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const fixtureSql = readFileSync(
    resolve(scriptDirectory, '../supabase/fixtures/demo.sql'),
    'utf8',
  );
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: fixtureSql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
  if (result.status !== 0) {
    throw new Error(
      'Demo seed failed. The local database was not fully seeded.',
    );
  }
  process.stdout.write('Synthetic local demo data created.\n');
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    runDemoSeed();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Demo seed failed.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
