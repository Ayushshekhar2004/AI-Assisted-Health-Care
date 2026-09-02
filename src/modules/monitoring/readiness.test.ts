import { describe, expect, it, vi } from 'vitest';

import { collectReadiness } from './readiness';

describe('service readiness aggregation', () => {
  it('reports ready only when every dependency is ready', async () => {
    const now = vi.fn().mockReturnValue(1_786_000_000_000);
    const report = await collectReadiness(
      {
        database: async () => 'READY',
        storage: async () => 'READY',
        ai: async () => 'READY',
        video: async () => 'READY',
      },
      now,
    );
    expect(report.status).toBe('READY');
    expect(report.services).toHaveLength(4);
  });

  it('degrades without exposing dependency error details', async () => {
    const report = await collectReadiness(
      {
        database: async () => 'READY',
        storage: async () => {
          throw new Error('synthetic sensitive provider detail');
        },
        ai: async () => 'UNCONFIGURED',
        video: async () => 'READY',
      },
      () => 1_786_000_000_000,
    );
    expect(report.status).toBe('DEGRADED');
    expect(
      report.services.find(({ service }) => service === 'storage'),
    ).toMatchObject({ status: 'DEGRADED' });
    expect(JSON.stringify(report)).not.toContain('synthetic sensitive');
  });
});
