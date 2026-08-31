'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { DoctorDashboardQuery } from '@/modules/scheduling';

const statuses = [
  'ALL',
  'REQUESTED',
  'CONFIRMED',
  'CANCELLED',
  'IN_PROGRESS',
  'COMPLETED',
  'NO_SHOW',
  'REQUIRES_IN_PERSON',
] as const;

export function DashboardFilters({
  query,
  syncTimezone,
}: Readonly<{ query: DoctorDashboardQuery; syncTimezone: boolean }>) {
  const router = useRouter();
  const [timezoneOffsetMinutes, setTimezoneOffsetMinutes] = useState(
    query.timezoneOffsetMinutes,
  );

  useEffect(() => {
    const deviceOffset = new Date().getTimezoneOffset();
    setTimezoneOffsetMinutes(deviceOffset);
    if (syncTimezone && deviceOffset !== query.timezoneOffsetMinutes) {
      const parameters = new URLSearchParams({
        page: '1',
        status: query.status,
        timezoneOffsetMinutes: String(deviceOffset),
        view: query.view,
      });
      router.replace(`/doctor?${parameters.toString()}`);
    }
  }, [
    query.status,
    query.timezoneOffsetMinutes,
    query.view,
    router,
    syncTimezone,
  ]);

  return (
    <form className="dashboard-filters" method="get">
      <input
        name="timezoneOffsetMinutes"
        type="hidden"
        value={timezoneOffsetMinutes}
      />
      <label>
        Date range
        <select defaultValue={query.view} name="view">
          <option value="TODAY">Today</option>
          <option value="UPCOMING">Upcoming after today</option>
        </select>
      </label>
      <label>
        Appointment status
        <select defaultValue={query.status} name="status">
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status === 'ALL' ? 'All statuses' : status.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">Apply filters</button>
    </form>
  );
}
