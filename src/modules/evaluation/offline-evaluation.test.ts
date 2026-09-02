import { describe, expect, it, vi } from 'vitest';

import fixtures from './fixtures/offline-evaluation-v2.json';
import {
  assertSyntheticEvaluationFixture,
  offlineEvaluationSuiteSchema,
  runOfflineEvaluationSuite,
} from './offline-evaluation';

describe('offline synthetic AI evaluation', () => {
  it('validates and passes every versioned synthetic case without a provider call', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    expect(() => offlineEvaluationSuiteSchema.parse(fixtures)).not.toThrow();
    const report = await runOfflineEvaluationSuite(fixtures);
    expect(report).toMatchObject({
      schema_version: 'offline-evaluation-v2',
      dataset_version: 'synthetic-eval-v2.0.0',
      status: 'PASS',
      release_blocking: false,
      total_cases: 40,
      passed_cases: 40,
      failed_cases: 0,
      run_metadata: {
        evaluation_runner_version: 'offline-evaluator-v2.0.0',
        model_name: 'offline-synthetic-candidate',
        model_version: 'offline-synthetic-candidate-v1',
        intake_prompt_version: 'intake-prompt-v1',
        routing_prompt_version: 'specialty-routing-prompt-v1',
      },
    });
    expect(report.cases.every((testCase) => testCase.passed)).toBe(true);
    expect(new Set(report.cases.map((testCase) => testCase.language))).toEqual(
      new Set(['en', 'hi']),
    );
    expect(
      new Set(report.cases.map((testCase) => testCase.scenario_band)),
    ).toEqual(new Set(['ROUTINE', 'AMBIGUOUS', 'EMERGENCY']));
    expect(
      report.cases.filter((testCase) => testCase.language === 'en'),
    ).toHaveLength(20);
    expect(
      report.cases.filter((testCase) => testCase.language === 'hi'),
    ).toHaveLength(20);
    expect(
      report.cases.filter((testCase) => testCase.scenario_band === 'ROUTINE'),
    ).toHaveLength(20);
    expect(
      report.cases.filter((testCase) => testCase.scenario_band === 'AMBIGUOUS'),
    ).toHaveLength(10);
    expect(
      report.cases.filter((testCase) => testCase.scenario_band === 'EMERGENCY'),
    ).toHaveLength(10);
    info.mockRestore();
  });

  it('rejects duplicate cases, malformed expectations, and extra fields', () => {
    expect(() =>
      offlineEvaluationSuiteSchema.parse({
        ...fixtures,
        cases: fixtures.cases.map((testCase, index) =>
          index === 1 ? fixtures.cases[0] : testCase,
        ),
      }),
    ).toThrow();
    expect(() =>
      offlineEvaluationSuiteSchema.parse({
        ...fixtures,
        cases: fixtures.cases.map((testCase, index) =>
          index === 0
            ? {
                ...testCase,
                expected: {
                  ...testCase.expected,
                  specialty_routing_band: 'UNCONTROLLED_SPECIALTY',
                },
              }
            : testCase,
        ),
      }),
    ).toThrow();
    expect(() =>
      offlineEvaluationSuiteSchema.parse({ ...fixtures, patient_name: 'x' }),
    ).toThrow();
  });

  it('rejects direct identifiers before evaluation', async () => {
    expect(() =>
      assertSyntheticEvaluationFixture({
        provenance: 'SYNTHETIC_NO_REAL_PATIENT_DATA',
        email: 'person@example.test',
      }),
    ).toThrow(/identity fields/i);
    await expect(
      runOfflineEvaluationSuite({
        ...fixtures,
        cases: fixtures.cases.map((testCase, index) =>
          index === 0
            ? { ...testCase, direct_identifier: 'person@example.test' }
            : testCase,
        ),
      }),
    ).rejects.toThrow(/direct identifiers/i);
  });

  it('reports mismatched expectations by field without clinical payloads', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const changed = structuredClone(fixtures);
    changed.cases[0]!.expected.intake_completeness = 'INCOMPLETE';
    const report = await runOfflineEvaluationSuite(changed);
    expect(report.cases[0]).toMatchObject({
      passed: false,
      release_blocking: false,
      error_categories: ['INTAKE_COMPLETENESS_MISMATCH'],
    });
    expect(JSON.stringify(report)).not.toContain('Synthetic skin concern');
    info.mockRestore();
  });

  it('makes every red-flag false negative release blocking', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const changed = structuredClone(fixtures);
    changed.cases[0]!.expected.red_flag_detection = true;
    const report = await runOfflineEvaluationSuite(changed, {
      modelName: 'offline-regression-candidate',
      modelVersion: 'offline-regression-v1',
    });
    expect(report).toMatchObject({
      status: 'FAIL',
      release_blocking: true,
      run_metadata: {
        model_name: 'offline-regression-candidate',
        model_version: 'offline-regression-v1',
      },
      error_summary: [
        {
          category: 'RED_FLAG_FALSE_NEGATIVE',
          count: 1,
          release_blocking: true,
        },
      ],
    });
    expect(report.cases[0]).toMatchObject({
      passed: false,
      release_blocking: true,
      error_categories: ['RED_FLAG_FALSE_NEGATIVE'],
    });
    info.mockRestore();
  });
});
