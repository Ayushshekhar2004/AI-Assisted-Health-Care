import { describe, expect, it } from 'vitest';
import {
  createFinalizedConsultationPdf,
  createPatientConsultationPacketPdf,
  createPatientIntakeSummaryLines,
} from './document';
const consultation = {
  id: '91000000-0000-4000-8000-000000000001',
  appointmentId: '81000000-0000-4000-8000-000000000001',
  subjectiveHistory: 'Synthetic history',
  examinationObservations: 'Remote limitations',
  assessment: 'Synthetic assessment',
  plan: 'Synthetic plan',
  followUp: '',
  telemedicineAdequacy: 'ADEQUATE' as const,
  status: 'FINALIZED' as const,
  finalizedAt: '2026-09-01T10:00:00.000Z',
  finalizedByDoctorId: '51000000-0000-4000-8000-000000000001',
  aiDraftGeneratedAt: null,
  aiModelName: null,
  aiModelVersion: null,
  aiPromptVersion: null,
  updatedAt: '2026-09-01T10:00:00.000Z',
};
const intake = {
  chief_complaint: 'Synthetic concern',
  onset: 'Synthetic onset',
  duration: 'Synthetic duration',
  severity: 'mild',
  associated_symptoms: ['Synthetic associated symptom'],
  relevant_history: [],
  current_medicines: [],
  allergies: [],
  pregnancy_possibility: {
    clinically_relevant: false,
    response: 'not_clinically_relevant' as const,
  },
  missing_information: ['allergies' as const],
  follow_up_question: 'INTERNAL QUESTION MUST NOT APPEAR',
  intake_complete: true,
};
describe('finalized consultation PDF', () => {
  it('creates a PDF only from finalized consultation content', async () => {
    const bytes = await createFinalizedConsultationPdf({
      appointmentId: consultation.appointmentId,
      consultation,
      prescription: null,
      outcome: null,
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });
  it('rejects draft consultation and prescription content', async () => {
    await expect(
      createFinalizedConsultationPdf({
        appointmentId: consultation.appointmentId,
        consultation: {
          ...consultation,
          status: 'DRAFT',
          finalizedAt: null,
          finalizedByDoctorId: null,
        },
        prescription: null,
        outcome: null,
      }),
    ).rejects.toThrow(/finalized/i);
  });

  it('creates a patient packet from allow-listed intake and finalized content', async () => {
    const lines = createPatientIntakeSummaryLines(intake);
    expect(lines.join(' ')).toContain('Synthetic concern');
    expect(lines.join(' ')).not.toContain('INTERNAL QUESTION');

    const bytes = await createPatientConsultationPacketPdf({
      appointmentId: consultation.appointmentId,
      consultation,
      prescription: null,
      outcome: null,
      intake,
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });
});
