import { z } from 'zod';
import {
  recordOperationalMetric,
  tryHashMonitoringIdentifier,
} from '@/modules/monitoring/server';

import { createRoleAuthorizedClient, type ProfileRole } from '@/modules/auth';
import { dispatchNotificationEventsForAppointment } from '@/modules/notification/server';

import {
  DOCTOR_DASHBOARD_PAGE_SIZE,
  appointmentCancellationSchema,
  appointmentRescheduleSchema,
  followUpBookingSchema,
  getDoctorDashboardRange,
  parseAvailabilityId,
  parseAvailabilityInput,
  parseDoctorDashboardQuery,
  type AvailabilityInput,
  type DoctorDashboardQuery,
} from './index';

const availabilitySchema = z.object({
  id: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});

export type AppointmentRescheduleOption = z.infer<typeof availabilitySchema>;
export type FollowUpBookingOption = z.infer<typeof availabilitySchema>;

const bookableSlotSchema = availabilitySchema.extend({
  doctorName: z.string().min(1).max(120),
  specialty: z.string().min(1).max(120),
  feePaise: z.number().int().min(0).max(100000000).nullable(),
});

const appointmentSchema = availabilitySchema.extend({
  doctorName: z.string().min(1).max(120),
  feePaise: z.number().int().min(0).max(100000000).nullable(),
  status: z.enum([
    'REQUESTED',
    'CONFIRMED',
    'CANCELLED',
    'IN_PROGRESS',
    'COMPLETED',
    'NO_SHOW',
    'REQUIRES_IN_PERSON',
  ]),
});

const doctorDashboardAppointmentSchema = z.object({
  id: z.string().uuid(),
  patientDisplayName: z.string().trim().min(1).max(120),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  language: z.enum(['en', 'hi']),
  status: appointmentSchema.shape.status,
  intakeState: z.enum([
    'NOT_STARTED',
    'IN_PROGRESS',
    'COMPLETED',
    'INCOMPLETE',
  ]),
  urgency: z.enum(['NOT_ASSESSED', 'ROUTINE', 'SOON', 'URGENT', 'EMERGENCY']),
});

type BookableSlotRow = Readonly<{
  availability_id: unknown;
  doctor_name: unknown;
  ends_at: unknown;
  fee_paise: unknown;
  specialty: unknown;
  starts_at: unknown;
}>;

type PatientAppointmentRow = Readonly<{
  appointment_id: unknown;
  doctor_name: unknown;
  ends_at: unknown;
  fee_paise: unknown;
  starts_at: unknown;
  status: unknown;
}>;

type AppointmentRescheduleOptionRow = Readonly<{
  availability_id: unknown;
  starts_at: unknown;
  ends_at: unknown;
}>;

type DoctorDashboardAppointmentRow = Readonly<{
  appointment_id: unknown;
  patient_display_name: unknown;
  starts_at: unknown;
  ends_at: unknown;
  patient_language: unknown;
  appointment_status: unknown;
  intake_state: unknown;
  urgency: unknown;
  total_count: unknown;
}>;

export type DoctorAvailability = z.infer<typeof availabilitySchema>;
export type BookableSlot = z.infer<typeof bookableSlotSchema>;
export type PatientAppointment = z.infer<typeof appointmentSchema>;
export type DoctorDashboardAppointment = z.infer<
  typeof doctorDashboardAppointmentSchema
>;
export type DoctorDashboardPage = Readonly<{
  appointments: DoctorDashboardAppointment[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  query: DoctorDashboardQuery;
}>;

async function createAuthorizedClient(requiredRole: ProfileRole) {
  return (
    await createRoleAuthorizedClient(
      [requiredRole],
      'Scheduling is unavailable',
    )
  ).supabase;
}

export async function listOwnDoctorAvailability(): Promise<
  DoctorAvailability[]
> {
  const supabase = await createAuthorizedClient('doctor');
  const { data, error } = await supabase
    .from('doctor_availability')
    .select('id, starts_at, ends_at')
    .gt('starts_at', new Date().toISOString())
    .order('starts_at');

  if (error) throw new Error('Scheduling is unavailable');
  return z.array(availabilitySchema).parse(
    (data ?? []).map((slot) => ({
      id: slot.id,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
    })),
  );
}

export async function createDoctorAvailability(
  input: AvailabilityInput,
): Promise<void> {
  const availability = parseAvailabilityInput(input);
  const supabase = await createAuthorizedClient('doctor');
  const { error } = await supabase.rpc('create_doctor_availability', {
    p_ends_at: availability.endsAtIso,
    p_starts_at: availability.startsAtIso,
  });
  if (error) throw new Error('Scheduling is unavailable');
}

export async function deleteDoctorAvailability(input: unknown): Promise<void> {
  const availabilityId = parseAvailabilityId(input);
  const supabase = await createAuthorizedClient('doctor');
  const { error } = await supabase.rpc('delete_doctor_availability', {
    p_availability_id: availabilityId,
  });
  if (error) throw new Error('Scheduling is unavailable');
}

export async function listBookableSlots(): Promise<BookableSlot[]> {
  const supabase = await createAuthorizedClient('patient');
  const { data, error } = await supabase.rpc('list_bookable_availability');
  if (error) throw new Error('Scheduling is unavailable');

  return z.array(bookableSlotSchema).parse(
    (data ?? []).map((slot: BookableSlotRow) => ({
      id: slot.availability_id,
      doctorName: slot.doctor_name,
      specialty: slot.specialty,
      feePaise: slot.fee_paise,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
    })),
  );
}

export async function listOwnPatientAppointments(): Promise<
  PatientAppointment[]
> {
  const supabase = await createAuthorizedClient('patient');
  const { data, error } = await supabase.rpc('list_patient_appointments');

  if (error) throw new Error('Scheduling is unavailable');
  return z.array(appointmentSchema).parse(
    (data ?? []).map((appointment: PatientAppointmentRow) => ({
      id: appointment.appointment_id,
      doctorName: appointment.doctor_name,
      feePaise: appointment.fee_paise,
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
      status: appointment.status,
    })),
  );
}

export async function listDoctorDashboardAppointments(
  input: unknown,
  now: Date = new Date(),
): Promise<DoctorDashboardPage> {
  const query = parseDoctorDashboardQuery(input);
  const range = getDoctorDashboardRange(query, now);
  const supabase = await createAuthorizedClient('doctor');
  const { data, error } = await supabase.rpc(
    'list_doctor_dashboard_appointments',
    {
      p_from: range.from,
      p_limit: DOCTOR_DASHBOARD_PAGE_SIZE,
      p_offset: (query.page - 1) * DOCTOR_DASHBOARD_PAGE_SIZE,
      p_status: query.status === 'ALL' ? null : query.status,
      p_until: range.until,
    },
  );

  if (error) throw new Error('Doctor dashboard is unavailable');
  const rows = (data ?? []) as DoctorDashboardAppointmentRow[];
  const appointments = z.array(doctorDashboardAppointmentSchema).parse(
    rows.map((appointment) => ({
      id: appointment.appointment_id,
      patientDisplayName: appointment.patient_display_name,
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
      language: appointment.patient_language,
      status: appointment.appointment_status,
      intakeState: appointment.intake_state,
      urgency: appointment.urgency,
    })),
  );
  const totalCount = z.coerce
    .number()
    .int()
    .nonnegative()
    .parse(rows[0]?.total_count ?? 0);

  return {
    appointments,
    page: query.page,
    pageSize: DOCTOR_DASHBOARD_PAGE_SIZE,
    totalCount,
    totalPages: Math.ceil(totalCount / DOCTOR_DASHBOARD_PAGE_SIZE),
    query,
  };
}

export async function bookAvailability(input: unknown): Promise<void> {
  let availabilityId: string;
  try {
    availabilityId = parseAvailabilityId(input);
  } catch {
    recordOperationalMetric({
      event: 'appointment.booking_failure',
      category: 'standard',
      outcome: 'invalid_input',
    });
    throw new Error('Scheduling is unavailable');
  }
  try {
    const supabase = await createAuthorizedClient('patient');
    const { error } = await supabase.rpc('request_appointment', {
      p_doctor_availability_id: availabilityId,
    });
    if (error) throw error;
  } catch {
    recordOperationalMetric({
      event: 'appointment.booking_failure',
      category: 'standard',
      outcome: 'database',
      identifierHash: await tryHashMonitoringIdentifier(availabilityId),
    });
    throw new Error('Scheduling is unavailable');
  }
}

const appointmentTransitionSchema = z.object({
  appointmentId: z.string().uuid(),
  nextStatus: appointmentSchema.shape.status,
});

export async function transitionAppointmentStatus(
  input: unknown,
): Promise<void> {
  const transition = appointmentTransitionSchema.parse(input);
  const { supabase } = await createRoleAuthorizedClient(
    ['patient', 'doctor'],
    'Scheduling is unavailable',
  );

  const { error } = await supabase.rpc('transition_appointment_status', {
    p_appointment_id: transition.appointmentId,
    p_next_status: transition.nextStatus,
  });
  if (error) throw new Error('Scheduling is unavailable');

  await dispatchNotificationEventsForAppointment(
    transition.appointmentId,
  ).catch(() => undefined);
}

export async function listAppointmentRescheduleOptions(
  appointmentIdInput: unknown,
): Promise<AppointmentRescheduleOption[]> {
  const appointmentId = z.string().uuid().parse(appointmentIdInput);
  const { supabase } = await createRoleAuthorizedClient(
    ['patient', 'doctor'],
    'Reschedule options are unavailable',
  );
  const { data, error } = await supabase.rpc(
    'list_appointment_reschedule_options',
    { p_appointment_id: appointmentId },
  );
  if (error) throw new Error('Reschedule options are unavailable');
  return z.array(availabilitySchema).parse(
    (data ?? []).map((option: AppointmentRescheduleOptionRow) => ({
      id: option.availability_id,
      startsAt: option.starts_at,
      endsAt: option.ends_at,
    })),
  );
}

export async function cancelOwnAppointment(input: unknown): Promise<void> {
  const cancellation = appointmentCancellationSchema.parse(input);
  const { supabase } = await createRoleAuthorizedClient(
    ['patient', 'doctor'],
    'Appointment cancellation is unavailable',
  );
  const { error } = await supabase.rpc('cancel_appointment', {
    p_appointment_id: cancellation.appointmentId,
    p_reason_category: cancellation.reasonCategory,
  });
  if (error) throw new Error('Appointment cancellation is unavailable');
  await dispatchNotificationEventsForAppointment(
    cancellation.appointmentId,
  ).catch(() => undefined);
}

export async function rescheduleOwnAppointment(
  input: unknown,
): Promise<string> {
  const reschedule = appointmentRescheduleSchema.parse(input);
  const { supabase } = await createRoleAuthorizedClient(
    ['patient', 'doctor'],
    'Appointment rescheduling is unavailable',
  );
  const { data, error } = await supabase.rpc('reschedule_appointment', {
    p_appointment_id: reschedule.appointmentId,
    p_new_availability_id: reschedule.availabilityId,
    p_reason_category: reschedule.reasonCategory,
  });
  if (error) throw new Error('Appointment rescheduling is unavailable');
  const replacementId = z.string().uuid().parse(data);
  await dispatchNotificationEventsForAppointment(
    reschedule.appointmentId,
  ).catch(() => undefined);
  return replacementId;
}

export async function listFollowUpBookingOptions(
  recommendationIdInput: unknown,
): Promise<FollowUpBookingOption[]> {
  const recommendationId = z.string().uuid().parse(recommendationIdInput);
  const supabase = await createAuthorizedClient('patient');
  const { data, error } = await supabase.rpc('list_follow_up_booking_options', {
    p_recommendation_id: recommendationId,
  });
  if (error) throw new Error('Follow-up booking is unavailable');
  return z.array(availabilitySchema).parse(
    (data ?? []).map((option: AppointmentRescheduleOptionRow) => ({
      id: option.availability_id,
      startsAt: option.starts_at,
      endsAt: option.ends_at,
    })),
  );
}

export async function bookFollowUp(input: unknown): Promise<void> {
  let value: z.infer<typeof followUpBookingSchema>;
  try {
    value = followUpBookingSchema.parse(input);
  } catch {
    recordOperationalMetric({
      event: 'appointment.booking_failure',
      category: 'follow_up',
      outcome: 'invalid_input',
    });
    throw new Error('Follow-up booking is unavailable');
  }
  try {
    const supabase = await createAuthorizedClient('patient');
    const { error } = await supabase.rpc('book_follow_up_appointment', {
      p_availability_id: value.availabilityId,
      p_recommendation_id: value.recommendationId,
    });
    if (error) throw error;
  } catch {
    recordOperationalMetric({
      event: 'appointment.booking_failure',
      category: 'follow_up',
      outcome: 'database',
      identifierHash: await tryHashMonitoringIdentifier(value.availabilityId),
    });
    throw new Error('Follow-up booking is unavailable');
  }
}
