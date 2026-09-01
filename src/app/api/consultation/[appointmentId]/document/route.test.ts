import { describe, expect, it, vi } from 'vitest';
const { generateOwnFinalizedDocument } = vi.hoisted(() => ({
  generateOwnFinalizedDocument: vi.fn(),
}));
vi.mock('../../../../../modules/prescription/document-server', () => ({
  generateOwnFinalizedDocument,
}));
import { GET } from './route';
describe('finalized consultation PDF endpoint', () => {
  it('returns authorized PDF bytes with private no-store headers', async () => {
    generateOwnFinalizedDocument.mockResolvedValue(
      new TextEncoder().encode('%PDF-synthetic'),
    );
    const response = await GET(new Request('https://synthetic.invalid'), {
      params: Promise.resolve({
        appointmentId: '81000000-0000-4000-8000-000000000001',
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('uses a generic denied response for drafts or unauthorized callers', async () => {
    generateOwnFinalizedDocument.mockRejectedValue(
      new Error('Synthetic denial'),
    );
    const response = await GET(new Request('https://synthetic.invalid'), {
      params: Promise.resolve({
        appointmentId: '81000000-0000-4000-8000-000000000001',
      }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Consultation document is unavailable',
    });
  });
});
