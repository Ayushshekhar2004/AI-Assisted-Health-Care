import { describe, expect, it } from 'vitest';

import {
  appointmentCancellationSchema,
  appointmentRescheduleSchema,
  followUpBookingSchema,
  parseAvailabilityId,
  parseAvailabilityInput,
} from './validation';

const now = new Date('2026-08-30T10:00:00.000Z');

describe('scheduling validation', () => {
  it('accepts a future availability window of at most 24 hours', () => {
    expect(
      parseAvailabilityInput(
        {
          startsAtIso: '2026-08-31T10:00:00.000Z',
          endsAtIso: '2026-08-31T10:30:00.000Z',
        },
        now,
      ),
    ).toEqual({
      startsAtIso: '2026-08-31T10:00:00.000Z',
      endsAtIso: '2026-08-31T10:30:00.000Z',
    });
  });

  it.each([
    ['2026-08-30T09:00:00.000Z', '2026-08-30T09:30:00.000Z'],
    ['2026-08-31T11:00:00.000Z', '2026-08-31T10:30:00.000Z'],
    ['2026-08-31T10:00:00.000Z', '2026-09-01T10:00:01.000Z'],
  ])('rejects an invalid availability window', (startsAtIso, endsAtIso) => {
    expect(() =>
      parseAvailabilityInput({ startsAtIso, endsAtIso }, now),
    ).toThrow();
  });

  it('rejects malformed slot identifiers', () => {
    expect(() => parseAvailabilityId('not-a-slot-id')).toThrow();
    expect(parseAvailabilityId('61000000-0000-4000-8000-000000000001')).toBe(
      '61000000-0000-4000-8000-000000000001',
    );
  });

  it('accepts only controlled appointment change reasons and opaque IDs', () => {
    expect(
      appointmentCancellationSchema.parse({
        appointmentId: '61000000-0000-4000-8000-000000000001',
        reasonCategory: 'PATIENT_SCHEDULE_CONFLICT',
      }),
    ).toEqual({
      appointmentId: '61000000-0000-4000-8000-000000000001',
      reasonCategory: 'PATIENT_SCHEDULE_CONFLICT',
    });
    expect(() =>
      appointmentCancellationSchema.parse({
        appointmentId: '61000000-0000-4000-8000-000000000001',
        reasonCategory: 'patient entered clinical details',
      }),
    ).toThrow();
  });

  it('rejects browser-supplied scheduling authority fields', () => {
    expect(() =>
      appointmentRescheduleSchema.parse({
        appointmentId: '61000000-0000-4000-8000-000000000001',
        availabilityId: '61000000-0000-4000-8000-000000000002',
        reasonCategory: 'OTHER',
        doctorId: '61000000-0000-4000-8000-000000000003',
      }),
    ).toThrow();
  });

  it('accepts only opaque IDs for follow-up booking', () => {
    expect(
      followUpBookingSchema.parse({
        recommendationId: '71000000-0000-4000-8000-000000000001',
        availabilityId: '61000000-0000-4000-8000-000000000002',
      }),
    ).toEqual({
      recommendationId: '71000000-0000-4000-8000-000000000001',
      availabilityId: '61000000-0000-4000-8000-000000000002',
    });
    expect(() =>
      followUpBookingSchema.parse({
        recommendationId: '71000000-0000-4000-8000-000000000001',
        availabilityId: '61000000-0000-4000-8000-000000000002',
        priorPrescriptionId: '91000000-0000-4000-8000-000000000001',
      }),
    ).toThrow();
  });
});
