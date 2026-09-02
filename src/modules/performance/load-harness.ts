import { performance } from 'node:perf_hooks';
import { z } from 'zod';

export const loadScenarioSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    iterations: z.number().int().positive().max(10_000),
    concurrency: z.number().int().positive().max(500),
    budget: z
      .object({
        p95Milliseconds: z.number().positive(),
        maximumErrorRate: z.number().min(0).max(1),
      })
      .strict(),
  })
  .strict();

export const loadResultSchema = z
  .object({
    name: z.string().min(1),
    iterations: z.number().int().positive(),
    concurrency: z.number().int().positive(),
    durationMilliseconds: z.number().nonnegative(),
    requestsPerSecond: z.number().nonnegative(),
    p50Milliseconds: z.number().nonnegative(),
    p95Milliseconds: z.number().nonnegative(),
    p99Milliseconds: z.number().nonnegative(),
    errorRate: z.number().min(0).max(1),
    peakInFlight: z.number().int().nonnegative(),
    passed: z.boolean(),
  })
  .strict();

export type LoadScenario = z.infer<typeof loadScenarioSchema>;
export type LoadResult = z.infer<typeof loadResultSchema>;

export async function runLoadScenario(
  input: LoadScenario,
  operation: (iteration: number) => Promise<void>,
): Promise<LoadResult> {
  const scenario = loadScenarioSchema.parse(input);
  const latencies: number[] = [];
  let nextIteration = 0;
  let errors = 0;
  let inFlight = 0;
  let peakInFlight = 0;
  const startedAt = performance.now();

  async function worker(): Promise<void> {
    while (true) {
      const iteration = nextIteration++;
      if (iteration >= scenario.iterations) return;

      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      const requestStartedAt = performance.now();
      try {
        await operation(iteration);
      } catch {
        errors += 1;
      } finally {
        latencies.push(performance.now() - requestStartedAt);
        inFlight -= 1;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(scenario.concurrency, scenario.iterations) },
      worker,
    ),
  );

  const durationMilliseconds = performance.now() - startedAt;
  const sortedLatencies = latencies.toSorted((left, right) => left - right);
  const errorRate = errors / scenario.iterations;
  const p95Milliseconds = percentile(sortedLatencies, 0.95);

  return loadResultSchema.parse({
    name: scenario.name,
    iterations: scenario.iterations,
    concurrency: scenario.concurrency,
    durationMilliseconds,
    requestsPerSecond:
      durationMilliseconds === 0
        ? scenario.iterations
        : scenario.iterations / (durationMilliseconds / 1_000),
    p50Milliseconds: percentile(sortedLatencies, 0.5),
    p95Milliseconds,
    p99Milliseconds: percentile(sortedLatencies, 0.99),
    errorRate,
    peakInFlight,
    passed:
      p95Milliseconds <= scenario.budget.p95Milliseconds &&
      errorRate <= scenario.budget.maximumErrorRate,
  });
}

export function findFirstBottleneck(
  scenarios: readonly LoadScenario[],
  results: readonly LoadResult[],
): LoadResult {
  if (scenarios.length === 0 || scenarios.length !== results.length) {
    throw new Error(
      'Load scenarios and results must have the same non-zero length',
    );
  }

  const budgets = new Map(
    scenarios.map((scenario) => [scenario.name, scenario.budget]),
  );
  return results.reduce((current, candidate) => {
    const currentBudget = budgets.get(current.name);
    const candidateBudget = budgets.get(candidate.name);
    if (!currentBudget || !candidateBudget) {
      throw new Error('Every result must have a matching load scenario');
    }
    const currentUtilization =
      current.p95Milliseconds / currentBudget.p95Milliseconds;
    const candidateUtilization =
      candidate.p95Milliseconds / candidateBudget.p95Milliseconds;
    return candidateUtilization > currentUtilization ? candidate : current;
  });
}

function percentile(sortedValues: readonly number[], quantile: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.max(0, Math.ceil(quantile * sortedValues.length) - 1);
  return sortedValues[index] ?? 0;
}
