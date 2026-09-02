import { describe, expect, it } from 'vitest';

import {
  findFirstBottleneck,
  runLoadScenario,
  type LoadResult,
  type LoadScenario,
} from './load-harness';

describe('local load harness', () => {
  it('bounds concurrency and records failed operations without leaking inputs', async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    const result = await runLoadScenario(
      {
        name: 'synthetic-boundary',
        iterations: 12,
        concurrency: 3,
        budget: { p95Milliseconds: 1_000, maximumErrorRate: 0.1 },
      },
      async (iteration) => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        if (iteration === 0) throw new Error('synthetic failure');
      },
    );

    expect(peakInFlight).toBe(3);
    expect(result.peakInFlight).toBe(3);
    expect(result.errorRate).toBeCloseTo(1 / 12);
    expect(result.passed).toBe(true);
  });

  it('identifies the scenario using the largest share of its latency budget', () => {
    const scenarios: LoadScenario[] = [
      scenario('auth', 20),
      scenario('ai', 200),
    ];
    const results: LoadResult[] = [result('auth', 15), result('ai', 100)];

    expect(findFirstBottleneck(scenarios, results).name).toBe('auth');
  });
});

function scenario(name: string, p95Milliseconds: number): LoadScenario {
  return {
    name,
    iterations: 1,
    concurrency: 1,
    budget: { p95Milliseconds, maximumErrorRate: 0 },
  };
}

function result(name: string, p95Milliseconds: number): LoadResult {
  return {
    name,
    iterations: 1,
    concurrency: 1,
    durationMilliseconds: p95Milliseconds,
    requestsPerSecond: 1,
    p50Milliseconds: p95Milliseconds,
    p95Milliseconds,
    p99Milliseconds: p95Milliseconds,
    errorRate: 0,
    peakInFlight: 1,
    passed: true,
  };
}
