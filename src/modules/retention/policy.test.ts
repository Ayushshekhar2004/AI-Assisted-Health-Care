import { describe, expect, it } from 'vitest';

import { parseRetentionJobConfig } from './config';
import { dataRetentionPolicy } from './policy';

describe('data retention policy', () => {
  it('classifies every required data family exactly once', () => {
    expect(
      dataRetentionPolicy.rules.map((rule) => rule.classification),
    ).toEqual([
      'OPERATIONAL_DATA',
      'CLINICAL_RECORD',
      'TRANSCRIPT',
      'RAW_AUDIO',
      'AUDIT_EVENT',
      'TEMPORARY_FILE',
    ]);
  });

  it('protects clinical, transcript, and audit records pending legal approval', () => {
    for (const classification of [
      'CLINICAL_RECORD',
      'TRANSCRIPT',
      'AUDIT_EVENT',
    ]) {
      expect(
        dataRetentionPolicy.rules.find(
          (rule) => rule.classification === classification,
        ),
      ).toMatchObject({
        action: 'PROTECT_PENDING_LEGAL_DECISION',
        deleteAfterDays: null,
        launchBlocker: true,
      });
    }
  });

  it('keeps raw audio disabled and limits disposal to operational or temporary data', () => {
    expect(
      dataRetentionPolicy.rules.find(
        (rule) => rule.classification === 'RAW_AUDIO',
      ),
    ).toMatchObject({ action: 'DISABLED', deleteAfterDays: null });
    expect(
      dataRetentionPolicy.rules
        .filter((rule) => rule.deleteAfterDays !== null)
        .map((rule) => rule.classification),
    ).toEqual(['OPERATIONAL_DATA', 'TEMPORARY_FILE']);
  });

  it('defaults execution off and accepts only explicit booleans', () => {
    expect(parseRetentionJobConfig({})).toEqual({ executionEnabled: false });
    expect(parseRetentionJobConfig({ executionEnabled: 'true' })).toEqual({
      executionEnabled: true,
    });
    expect(() =>
      parseRetentionJobConfig({ executionEnabled: 'yes' }),
    ).toThrow();
  });
});
