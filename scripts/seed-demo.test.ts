import { describe, expect, it } from 'vitest';

import {
  assertLocalDemoSeedTarget,
  DEMO_SEED_CONFIRMATION,
  selectLocalDatabaseContainer,
} from './seed-demo.mjs';

const localStatus = {
  API_URL: 'http://127.0.0.1:54321',
  DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:54322/postgres',
};

describe('demo seed production guard', () => {
  it('requires the exact explicit confirmation', () => {
    expect(() =>
      assertLocalDemoSeedTarget({
        confirmation: undefined,
        status: localStatus,
      }),
    ).toThrow('Demo seed blocked');
  });

  it('accepts the explicitly confirmed loopback stack', () => {
    expect(
      assertLocalDemoSeedTarget({
        confirmation: DEMO_SEED_CONFIRMATION,
        status: localStatus,
      }),
    ).toEqual(localStatus);
  });

  it('rejects a hosted Supabase target even when confirmed', () => {
    expect(() =>
      assertLocalDemoSeedTarget({
        confirmation: DEMO_SEED_CONFIRMATION,
        status: {
          API_URL: 'https://project.supabase.co',
          DB_URL:
            'postgresql://postgres:synthetic@db.project.supabase.co:5432/postgres',
        },
      }),
    ).toThrow('only the loopback Supabase stack is allowed');
  });

  it('requires one unambiguous local database container', () => {
    expect(selectLocalDatabaseContainer('supabase_db_demo\n')).toBe(
      'supabase_db_demo',
    );
    expect(() => selectLocalDatabaseContainer('')).toThrow('exactly one');
    expect(() =>
      selectLocalDatabaseContainer('supabase_db_one\nsupabase_db_two\n'),
    ).toThrow('exactly one');
  });
});
