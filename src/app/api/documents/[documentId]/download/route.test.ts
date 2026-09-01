import { beforeEach, describe, expect, it, vi } from 'vitest';
const { createDownload } = vi.hoisted(() => ({ createDownload: vi.fn() }));
vi.mock('../../../../../modules/patient/document-server', () => ({
  createOwnPatientDocumentDownload: createDownload,
}));
import { GET } from './route';

describe('document download route', () => {
  beforeEach(() => createDownload.mockReset());
  it('redirects only to the authorized short-lived signed URL with private headers', async () => {
    createDownload.mockResolvedValue({
      url: 'https://storage.invalid/signed-token',
      filename: 'synthetic.pdf',
    });
    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({
        documentId: '00000000-0000-4000-8000-000000000001',
      }),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://storage.invalid/signed-token',
    );
    expect(response.headers.get('cache-control')).toBe('no-store, private');
  });
});
