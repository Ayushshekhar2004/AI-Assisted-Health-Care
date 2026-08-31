import { describe, expect, it } from 'vitest';

import {
  getDoctorDashboardRange,
  parseDoctorDashboardQuery,
} from './dashboard';

describe('doctor dashboard query', () => {
  it('validates filters and applies safe pagination defaults', () => {
    expect(
      parseDoctorDashboardQuery({
        page: '2',
        status: 'CONFIRMED',
        timezoneOffsetMinutes: '-330',
        view: 'UPCOMING',
        doctorId: 'untrusted-doctor-id',
      }),
    ).toEqual({
      page: 2,
      status: 'CONFIRMED',
      timezoneOffsetMinutes: -330,
      view: 'UPCOMING',
    });
  });

  it('rejects unsupported values by returning bounded defaults', () => {
    expect(
      parseDoctorDashboardQuery({
        page: '-4',
        status: 'UNSAFE',
        timezoneOffsetMinutes: '900',
        view: 'PAST',
      }),
    ).toEqual({
      page: 1,
      status: 'ALL',
      timezoneOffsetMinutes: 0,
      view: 'TODAY',
    });
  });

  it('calculates today and upcoming boundaries using the doctor device offset', () => {
    const now = new Date('2026-09-01T05:15:00.000Z');
    const todayQuery = parseDoctorDashboardQuery({
      timezoneOffsetMinutes: -330,
      view: 'TODAY',
    });
    const upcomingQuery = { ...todayQuery, view: 'UPCOMING' as const };

    expect(getDoctorDashboardRange(todayQuery, now)).toEqual({
      from: '2026-08-31T18:30:00.000Z',
      until: '2026-09-01T18:30:00.000Z',
    });
    expect(getDoctorDashboardRange(upcomingQuery, now).from).toBe(
      '2026-09-01T18:30:00.000Z',
    );
  });
});
