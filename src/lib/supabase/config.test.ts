import { describe, expect, it } from 'vitest';

import { parseSupabaseConfig } from './config';

describe('parseSupabaseConfig', () => {
  it('accepts an HTTPS project URL and publishable key', () => {
    expect(
      parseSupabaseConfig({
        url: 'https://synthetic-project.supabase.co',
        publishableKey: 'sb_publishable_synthetic',
      }),
    ).toEqual({
      url: 'https://synthetic-project.supabase.co',
      publishableKey: 'sb_publishable_synthetic',
    });
  });

  it('rejects an insecure project URL', () => {
    expect(() =>
      parseSupabaseConfig({
        url: 'http://synthetic-project.supabase.co',
        publishableKey: 'sb_publishable_synthetic',
      }),
    ).toThrow();
  });

  it('rejects a missing publishable key', () => {
    expect(() =>
      parseSupabaseConfig({ url: 'https://synthetic-project.supabase.co' }),
    ).toThrow();
  });
});
