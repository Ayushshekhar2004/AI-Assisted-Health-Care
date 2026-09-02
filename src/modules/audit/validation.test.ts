import { describe, expect, it } from 'vitest';

import {
  applicationAuditEventSchema,
  auditLookupQuerySchema,
} from './validation';

describe('application audit event validation', () => {
  it('accepts an allow-listed content-free event', () => {
    expect(
      applicationAuditEventSchema.parse({
        action: 'login_role_resolution_failed',
        targetType: 'auth_user',
        targetId: '11000000-0000-4000-8000-000000000001',
        outcome: 'success',
      }),
    ).toEqual({
      action: 'login_role_resolution_failed',
      targetType: 'auth_user',
      targetId: '11000000-0000-4000-8000-000000000001',
      outcome: 'success',
    });
  });

  it('rejects raw payloads and incompatible action targets', () => {
    expect(() =>
      applicationAuditEventSchema.parse({
        action: 'login_role_resolution_failed',
        targetType: 'auth_user',
        targetId: '11000000-0000-4000-8000-000000000001',
        outcome: 'success',
        payload: { clinicalContent: 'must not be accepted' },
      }),
    ).toThrow();
    expect(() =>
      applicationAuditEventSchema.parse({
        action: 'admin_doctor_verification_queue_viewed',
        targetType: 'auth_user',
        targetId: '11000000-0000-4000-8000-000000000001',
        outcome: 'success',
      }),
    ).toThrow();
  });

  it('limits operations audit lookups to strict filters and 31 days', () => {
    expect(
      auditLookupQuerySchema.parse({
        category: 'CONSENT',
        actorId: '',
        targetId: '',
        from: '2026-09-01',
        to: '2026-09-30',
        page: '1',
      }),
    ).toMatchObject({ category: 'CONSENT', page: 1 });
    expect(() =>
      auditLookupQuerySchema.parse({
        category: 'ALL',
        actorId: '',
        targetId: '',
        from: '2026-01-01',
        to: '2026-09-01',
        page: 1,
      }),
    ).toThrow();
  });
});
