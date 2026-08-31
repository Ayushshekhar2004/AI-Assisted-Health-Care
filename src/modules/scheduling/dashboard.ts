import { z } from 'zod';

export const doctorDashboardViewSchema = z.enum(['TODAY', 'UPCOMING']);

export const appointmentStatusSchema = z.enum([
  'REQUESTED',
  'CONFIRMED',
  'CANCELLED',
  'IN_PROGRESS',
  'COMPLETED',
  'NO_SHOW',
  'REQUIRES_IN_PERSON',
]);

export const doctorDashboardStatusFilterSchema = z.union([
  z.literal('ALL'),
  appointmentStatusSchema,
]);

const doctorDashboardQuerySchema = z
  .object({
    view: doctorDashboardViewSchema.catch('TODAY'),
    status: doctorDashboardStatusFilterSchema.catch('ALL'),
    page: z.coerce.number().int().min(1).max(1000).catch(1),
    timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840).catch(0),
  })
  .strip();

export type DoctorDashboardQuery = z.infer<typeof doctorDashboardQuerySchema>;
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export type DoctorDashboardRange = Readonly<{
  from: string;
  until: string;
}>;

export const DOCTOR_DASHBOARD_PAGE_SIZE = 10;

export function parseDoctorDashboardQuery(
  input: unknown,
): DoctorDashboardQuery {
  return doctorDashboardQuerySchema.parse(input);
}

export function getDoctorDashboardRange(
  query: DoctorDashboardQuery,
  now: Date = new Date(),
): DoctorDashboardRange {
  const offsetMs = query.timezoneOffsetMinutes * 60_000;
  const localNow = new Date(now.getTime() - offsetMs);
  const localMidnightAsUtc = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
  );
  const todayStart = new Date(localMidnightAsUtc + offsetMs);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  if (query.view === 'TODAY') {
    return {
      from: todayStart.toISOString(),
      until: tomorrowStart.toISOString(),
    };
  }

  const upcomingLimit = new Date(tomorrowStart);
  upcomingLimit.setUTCFullYear(upcomingLimit.getUTCFullYear() + 1);
  return {
    from: tomorrowStart.toISOString(),
    until: upcomingLimit.toISOString(),
  };
}
