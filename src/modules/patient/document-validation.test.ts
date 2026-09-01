import { describe, expect, it } from 'vitest';
import { File } from 'node:buffer';
import { validatePatientDocument } from './document-validation';

function asBrowserFile(file: File): globalThis.File {
  return file as unknown as globalThis.File;
}

describe('validatePatientDocument', () => {
  it('accepts a PDF when MIME, extension, size, and signature agree', async () => {
    const file = new File(
      [new TextEncoder().encode('%PDF-1.7 synthetic')],
      'synthetic-report.pdf',
      { type: 'application/pdf' },
    );
    await expect(
      validatePatientDocument(asBrowserFile(file)),
    ).resolves.toMatchObject({
      extension: 'pdf',
      mimeType: 'application/pdf',
    });
  });

  it('rejects mismatched extensions and spoofed content', async () => {
    const extensionMismatch = new File(
      [new TextEncoder().encode('%PDF-1.7')],
      'synthetic-report.png',
      { type: 'application/pdf' },
    );
    const spoofed = new File(
      [new TextEncoder().encode('not a pdf')],
      'synthetic-report.pdf',
      { type: 'application/pdf' },
    );
    await expect(
      validatePatientDocument(asBrowserFile(extensionMismatch)),
    ).rejects.toThrow();
    await expect(
      validatePatientDocument(asBrowserFile(spoofed)),
    ).rejects.toThrow('File content');
  });

  it('rejects path-like filenames', async () => {
    const file = new File(
      [new TextEncoder().encode('%PDF-1.7 synthetic')],
      '../synthetic-report.pdf',
      { type: 'application/pdf' },
    );
    await expect(
      validatePatientDocument(asBrowserFile(file)),
    ).rejects.toThrow();
  });
});
