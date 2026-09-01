import { describe, expect, it } from 'vitest';
import { createFinalizedConsultationPdf } from './document';
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
});
