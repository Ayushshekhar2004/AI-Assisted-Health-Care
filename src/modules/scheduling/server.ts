import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import type { ProfileRole } from '@/modules/auth';

import {
  DOCTOR_DASHBOARD_PAGE_SIZE,
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
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Scheduling is unavailable');

  const profile = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (profile.error || profile.data?.role !== requiredRole) {
    throw new Error('Scheduling is unavailable');
  }

  return supabase;
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
  const availabilityId = parseAvailabilityId(input);
  const supabase = await createAuthorizedClient('patient');
  const { error } = await supabase.rpc('request_appointment', {
    p_doctor_availability_id: availabilityId,
  });
  if (error) throw new Error('Scheduling is unavailable');
}
