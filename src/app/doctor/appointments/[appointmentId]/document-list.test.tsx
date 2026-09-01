import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DoctorDocumentList } from './document-list';

const base = {
  id: '00000000-0000-4000-8000-000000000001',
  appointmentId: '00000000-0000-4000-8000-000000000002',
  filename: 'synthetic.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 100,
  createdAt: '2026-01-01T00:00:00Z',
} as const;

describe('DoctorDocumentList', () => {
  it('withholds links for unscanned files', () => {
    render(
      <DoctorDocumentList
        documents={[{ ...base, scanStatus: 'PENDING_SCAN' }]}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/unavailable until/i)).toBeInTheDocument();
  });

  it('offers only an attachment download after a clean result', () => {
    render(
      <DoctorDocumentList documents={[{ ...base, scanStatus: 'CLEAN' }]} />,
    );
    expect(
      screen.getByRole('link', { name: /download scanned/i }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/api/doctor/documents/'),
    );
    expect(screen.queryByRole('img')).toBeNull();
  });
});
