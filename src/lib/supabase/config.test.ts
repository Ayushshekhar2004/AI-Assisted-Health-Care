import { describe, expect, it } from 'vitest';

import { parseSupabaseConfig } from './config';

const hostedConfig = {
  appEnvironment: 'staging',
  projectRef: 'stagingproject',
  resourceNamespace: 'staging-stagingproject',
  url: 'https://stagingproject.supabase.co',
  publishableKey: 'sb_publishable_synthetic',
  siteUrl: 'https://staging.healthcare.example',
} as const;

const localConfig = {
  appEnvironment: 'development',
  projectRef: 'local',
  resourceNamespace: 'development-local',
  url: 'http://127.0.0.1:54321',
  publishableKey: 'sb_publishable_synthetic',
  siteUrl: 'http://localhost:3000',
} as const;

describe('parseSupabaseConfig', () => {
  it('accepts an HTTPS project URL and publishable key', () => {
    expect(parseSupabaseConfig(hostedConfig)).toEqual(hostedConfig);
  });

  it('rejects an insecure project URL', () => {
    expect(() =>
      parseSupabaseConfig({
        ...hostedConfig,
        url: 'http://stagingproject.supabase.co',
      }),
    ).toThrow();
  });

  it('rejects a missing publishable key', () => {
    expect(() =>
      parseSupabaseConfig({
        ...hostedConfig,
        publishableKey: undefined,
      }),
    ).toThrow();
  });

  it('allows HTTP only for loopback development', () => {
    expect(parseSupabaseConfig(localConfig).siteUrl).toBe(
      'http://localhost:3000',
    );

    expect(() =>
      parseSupabaseConfig({
        ...hostedConfig,
        siteUrl: 'http://healthcare.example',
      }),
    ).toThrow();
  });

  it('allows a loopback HTTP Supabase URL for local development', () => {
    expect(parseSupabaseConfig(localConfig).url).toBe('http://127.0.0.1:54321');
  });

  it('rejects a project reference that does not match the hosted URL', () => {
    expect(() =>
      parseSupabaseConfig({
        ...hostedConfig,
        projectRef: 'productionproject',
        resourceNamespace: 'staging-productionproject',
      }),
    ).toThrow();
  });

  it('rejects cross-environment resource namespaces', () => {
    expect(() =>
      parseSupabaseConfig({
        ...hostedConfig,
        resourceNamespace: 'production-stagingproject',
      }),
    ).toThrow();
  });

  it('rejects mismatched public and server environment markers', () => {
    expect(() =>
      parseSupabaseConfig({
        ...hostedConfig,
        serverEnvironment: 'production',
      }),
    ).toThrow();
  });

  it('rejects hosted projects in development and local projects outside development', () => {
    expect(() =>
      parseSupabaseConfig({ ...hostedConfig, appEnvironment: 'development' }),
    ).toThrow();
    expect(() =>
      parseSupabaseConfig({ ...localConfig, appEnvironment: 'production' }),
    ).toThrow();
  });
});
