import { describe, expect, it } from 'vitest';

import { parseAppointmentDetailId } from './validation';

describe('appointment detail validation', () => {
  it('accepts only a stable UUID appointment identifier', () => {
    expect(
      parseAppointmentDetailId('91000000-0000-4000-8000-000000000001'),
    ).toBe('91000000-0000-4000-8000-000000000001');
    expect(() => parseAppointmentDetailId('../patient-records')).toThrow();
    expect(() =>
      parseAppointmentDetailId({
        appointmentId: '91000000-0000-4000-8000-000000000001',
        doctorId: 'untrusted-doctor-id',
      }),
    ).toThrow();
  });
});
