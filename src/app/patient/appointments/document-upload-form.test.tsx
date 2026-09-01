import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentUploadForm } from './document-upload-form';

vi.mock('./actions', () => ({ uploadDocumentAction: vi.fn() }));
vi.mock('react', async () => ({
  ...(await vi.importActual('react')),
  useActionState: () => [{ message: '', status: 'idle' }, vi.fn(), false],
}));

describe('DocumentUploadForm', () => {
  it('states private upload limits and restricts the file picker', () => {
    render(
      <DocumentUploadForm appointmentId="00000000-0000-4000-8000-000000000001" />,
    );
    expect(screen.getByText(/Maximum 10 MB/)).toBeInTheDocument();
    expect(screen.getByLabelText(/private report/i)).toHaveAttribute(
      'accept',
      expect.stringContaining('application/pdf'),
    );
  });
});
