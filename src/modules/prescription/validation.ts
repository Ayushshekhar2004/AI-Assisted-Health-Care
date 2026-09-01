import { z } from 'zod';

const shortText = (max: number) => z.string().trim().max(max);

export const prescriptionItemInputSchema = z
  .object({
    itemType: z.enum(['MEDICINE', 'TEST', 'INSTRUCTION']),
    itemName: z.string().trim().min(1).max(500),
    dosage: shortText(200),
    frequency: shortText(200),
    duration: shortText(200),
    instructions: shortText(1000),
  })
  .strict();

export const prescriptionInputSchema = z
  .object({
    appointmentId: z.string().uuid(),
    followUp: shortText(4000),
    items: z.array(prescriptionItemInputSchema).max(50),
  })
  .strict();

export const prescriptionSchema = z
  .object({
    id: z.string().uuid(),
    appointmentId: z.string().uuid(),
    patientId: z.string().uuid(),
    doctorId: z.string().uuid(),
    doctorName: z.string().trim().min(2).max(120),
    registrationNumber: z.string().trim().min(2).max(80),
    registrationCouncil: z.string().trim().min(2).max(120),
    registrationState: z.string().trim().min(2).max(120),
    prescriptionDate: z.string().date(),
    followUp: z.string().max(4000),
    status: z.enum(['DRAFT', 'FINAL']),
    finalizedAt: z.string().datetime({ offset: true }).nullable(),
    items: z.array(
      prescriptionItemInputSchema.extend({
        id: z.string().uuid(),
        sortOrder: z.number().int().min(0).max(49),
      }),
    ),
  })
  .strict();

export type PrescriptionItemInput = z.infer<typeof prescriptionItemInputSchema>;
export type PrescriptionInput = z.infer<typeof prescriptionInputSchema>;
export type Prescription = z.infer<typeof prescriptionSchema>;
