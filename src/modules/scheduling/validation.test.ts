import { describe, expect, it } from 'vitest';

import { parseAvailabilityId, parseAvailabilityInput } from './validation';

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
});
