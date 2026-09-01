import { z } from 'zod';

export const PATIENT_HISTORY_PAGE_SIZE = 10;

export const patientHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(2500).catch(1),
  })
  .strip();

const historyOutcomeSchema = z
  .object({
    outcome: z.enum([
      'TELECONSULT_COMPLETED',
      'FOLLOW_UP_REQUIRED',
      'REFER_SPECIALTY',
      'PHYSICAL_EXAM_REQUIRED',
    ]),
    referral_specialty: z.string().nullable(),
    clinic_location: z.string().nullable(),
    location_instructions: z.string().nullable(),
    appointment_note: z.string().nullable(),
    recorded_at: z.string().datetime({ offset: true }),
  })
  .strict();

const historyPrescriptionItemSchema = z
  .object({
    id: z.string().uuid(),
    item_type: z.enum(['MEDICINE', 'TEST', 'INSTRUCTION']),
    item_name: z.string().min(1).max(500),
    dosage: z.string().max(200),
    frequency: z.string().max(200),
    duration: z.string().max(200),
    instructions: z.string().max(1000),
    sort_order: z.number().int().min(0).max(49),
  })
  .strict();

const historyPrescriptionSchema = z
  .object({
    id: z.string().uuid(),
    prescription_date: z.string().date(),
    follow_up: z.string().max(4000),
    finalized_at: z.string().datetime({ offset: true }),
    items: z.array(historyPrescriptionItemSchema).max(50),
  })
  .strict();

const historyDocumentSchema = z
  .object({
    id: z.string().uuid(),
    filename: z.string().min(1).max(255),
    mime_type: z.enum([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]),
    size_bytes: z.coerce.number().int().min(1).max(10485760),
    scan_status: z.enum([
      'PENDING_SCAN',
      'CLEAN',
      'QUARANTINED',
      'REJECTED',
      'SCAN_FAILED',
    ]),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();

export const patientHistoryItemSchema = z
  .object({
    appointmentId: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    status: z.enum([
      'REQUESTED',
      'CONFIRMED',
      'CANCELLED',
      'IN_PROGRESS',
      'COMPLETED',
      'NO_SHOW',
      'REQUIRES_IN_PERSON',
    ]),
    doctorName: z.string().trim().min(2).max(120),
    doctorSpecialty: z.string().trim().min(2).max(120),
    outcome: historyOutcomeSchema.nullable(),
    prescription: historyPrescriptionSchema.nullable(),
    documents: z.array(historyDocumentSchema),
  })
  .strict();

export type PatientHistoryItem = z.infer<typeof patientHistoryItemSchema>;
export type PatientHistoryQuery = z.infer<typeof patientHistoryQuerySchema>;

export function parsePatientHistoryQuery(input: unknown): PatientHistoryQuery {
  return patientHistoryQuerySchema.parse(input);
}
