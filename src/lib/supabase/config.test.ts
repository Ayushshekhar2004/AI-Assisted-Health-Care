import { describe, expect, it } from 'vitest';

import { parseSupabaseConfig } from './config';

describe('parseSupabaseConfig', () => {
  it('accepts an HTTPS project URL and publishable key', () => {
    expect(
      parseSupabaseConfig({
        url: 'https://synthetic-project.supabase.co',
        publishableKey: 'sb_publishable_synthetic',
        siteUrl: 'https://healthcare.example',
      }),
    ).toEqual({
      url: 'https://synthetic-project.supabase.co',
      publishableKey: 'sb_publishable_synthetic',
      siteUrl: 'https://healthcare.example',
    });
  });

  it('rejects an insecure project URL', () => {
    expect(() =>
      parseSupabaseConfig({
        url: 'http://synthetic-project.supabase.co',
        publishableKey: 'sb_publishable_synthetic',
        siteUrl: 'https://healthcare.example',
      }),
    ).toThrow();
  });

  it('rejects a missing publishable key', () => {
    expect(() =>
      parseSupabaseConfig({
        url: 'https://synthetic-project.supabase.co',
        siteUrl: 'https://healthcare.example',
      }),
    ).toThrow();
  });

  it('allows HTTP only for loopback development', () => {
    expect(
      parseSupabaseConfig({
        url: 'https://synthetic-project.supabase.co',
        publishableKey: 'sb_publishable_synthetic',
        siteUrl: 'http://localhost:3000',
      }).siteUrl,
    ).toBe('http://localhost:3000');

    expect(() =>
      parseSupabaseConfig({
        url: 'https://synthetic-project.supabase.co',
        publishableKey: 'sb_publishable_synthetic',
        siteUrl: 'http://healthcare.example',
      }),
    ).toThrow();
  });
});
