import { describe, expect, it } from 'vitest';
import { unconfiguredMalwareScanner } from './document-scanner';
describe('unconfiguredMalwareScanner', () => {
  it('fails closed instead of marking an unscanned document clean', async () => {
    await expect(
      unconfiguredMalwareScanner.scan({
        bucketId: 'patient-documents',
        objectPath: 'synthetic/path.pdf',
        documentId: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toThrow('not configured');
  });
});
