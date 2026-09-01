import { describe, expect, it, vi } from 'vitest';

const { generateOwnPatientConsultationPacket } = vi.hoisted(() => ({
  generateOwnPatientConsultationPacket: vi.fn(),
}));

vi.mock('../../../../../../modules/prescription/document-server', () => ({
  generateOwnPatientConsultationPacket,
}));

import { GET } from './route';

describe('patient consultation packet endpoint', () => {
  it('returns authorized PDF bytes with private download headers', async () => {
    generateOwnPatientConsultationPacket.mockResolvedValue(
      new TextEncoder().encode('%PDF-synthetic'),
    );
    const response = await GET(new Request('https://synthetic.invalid'), {
      params: Promise.resolve({
        appointmentId: '81000000-0000-4000-8000-000000000001',
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain(
      'consultation-packet-',
    );
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('returns a generic denial for drafts and unauthorized callers', async () => {
    generateOwnPatientConsultationPacket.mockRejectedValue(
      new Error('Synthetic denial'),
    );
    const response = await GET(new Request('https://synthetic.invalid'), {
      params: Promise.resolve({
        appointmentId: '81000000-0000-4000-8000-000000000001',
      }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Consultation packet is unavailable',
    });
  });
});
