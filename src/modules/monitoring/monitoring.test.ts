import { describe, expect, it, vi } from 'vitest';
import {
  hashMonitoringIdentifier,
  RecentFailureCounter,
  recordOperationalMetric,
  type OperationalMonitoringProvider,
} from './monitoring';
import { parseMonitoringConfig } from './config';

describe('operational monitoring privacy boundary', () => {
  it('records allow-listed operational fields', () => {
    const record = vi.fn();
    const provider: OperationalMonitoringProvider = { record };
    recordOperationalMetric(
      {
        event: 'ai.workflow',
        category: 'routing',
        durationMs: 125,
        outcome: 'success',
      },
      provider,
    );
    expect(record).toHaveBeenCalledWith({
      event: 'ai.workflow',
      category: 'routing',
      durationMs: 125,
      outcome: 'success',
    });
  });

  it('rejects clinical content, arbitrary errors, and raw identifiers', () => {
    const provider: OperationalMonitoringProvider = { record: vi.fn() };
    expect(() =>
      recordOperationalMetric(
        {
          event: 'appointment.booking_failure',
          category: 'standard',
          outcome: 'database',
          appointmentId: '91000000-0000-4000-8000-000000000001',
          symptom: 'synthetic symptom text',
          error: 'raw provider error',
        },
        provider,
      ),
    ).toThrow();
  });

  it('creates stable, salt-separated identifier pseudonyms', async () => {
    const identifier = '91000000-0000-4000-8000-000000000001';
    const first = await hashMonitoringIdentifier(identifier, 'a'.repeat(32));
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      hashMonitoringIdentifier(identifier, 'a'.repeat(32)),
    ).resolves.toBe(first);
    await expect(
      hashMonitoringIdentifier(identifier, 'b'.repeat(32)),
    ).resolves.not.toBe(first);
  });

  it('requires the monitoring pseudonym salt in production', () => {
    expect(() =>
      parseMonitoringConfig({ nodeEnvironment: 'production' }),
    ).toThrow();
    expect(
      parseMonitoringConfig({
        nodeEnvironment: 'production',
        hashSalt: 'a'.repeat(32),
      }),
    ).toMatchObject({ nodeEnvironment: 'production' });
  });

  it('counts only recent failures without retaining metric fields', () => {
    const counter = new RecentFailureCounter();
    counter.add(
      { event: 'ai.workflow', category: 'routing', outcome: 'success' },
      1_000,
    );
    counter.add(
      { event: 'ai.workflow', category: 'routing', outcome: 'timeout' },
      2_000,
    );
    counter.add(
      { event: 'auth.failure', category: 'login', outcome: 'credentials' },
      3_000,
    );
    expect(counter.counts(4_000, 3_000)).toEqual([
      { event: 'ai.workflow', count: 1 },
      { event: 'auth.failure', count: 1 },
    ]);
    expect(counter.counts(10_000, 1_000)).toEqual([]);
  });
});
