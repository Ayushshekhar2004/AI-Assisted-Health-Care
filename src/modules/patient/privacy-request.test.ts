import { describe, expect, it } from 'vitest';

import {
  patientPrivacyRequestSchema,
  privacyRequestInputSchema,
  privacyRequestTransitionSchema,
} from './privacy-request';

describe('privacy request validation', () => {
  it('accepts each controlled workflow type with bounded details', () => {
    for (const requestType of [
      'DATA_EXPORT',
      'RECORD_CORRECTION',
      'ACCOUNT_DEACTIVATION_OR_DELETION',
      'GRIEVANCE',
    ]) {
      expect(
        privacyRequestInputSchema.parse({
          requestType,
          details: 'Synthetic request details for an authorized reviewer.',
        }).requestType,
      ).toBe(requestType);
    }
  });

  it('rejects oversized details and client-supplied identity or status', () => {
    expect(() =>
      privacyRequestInputSchema.parse({
        requestType: 'DATA_EXPORT',
        details: 'x'.repeat(2001),
      }),
    ).toThrow();
    expect(() =>
      privacyRequestInputSchema.parse({
        requestType: 'DATA_EXPORT',
        details: 'Synthetic details',
        patientId: crypto.randomUUID(),
        status: 'RESOLVED',
      }),
    ).toThrow();
  });

  it('requires protected records to remain retained in returned state', () => {
    const base = {
      id: crypto.randomUUID(),
      requestType: 'ACCOUNT_DEACTIVATION_OR_DELETION',
      status: 'QUEUED',
      resolutionCategory: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(() =>
      patientPrivacyRequestSchema.parse({
        ...base,
        protectedRecordsRetained: false,
      }),
    ).toThrow();
    expect(
      patientPrivacyRequestSchema.parse({
        ...base,
        protectedRecordsRetained: true,
      }).protectedRecordsRetained,
    ).toBe(true);
  });

  it('accepts only controlled operations transitions', () => {
    expect(
      privacyRequestTransitionSchema.parse({
        requestId: crypto.randomUUID(),
        nextStatus: 'UNDER_REVIEW',
        resolutionCategory: '',
      }).nextStatus,
    ).toBe('UNDER_REVIEW');
    expect(() =>
      privacyRequestTransitionSchema.parse({
        requestId: crypto.randomUUID(),
        nextStatus: 'DELETED',
        resolutionCategory: '',
      }),
    ).toThrow();
  });
});
