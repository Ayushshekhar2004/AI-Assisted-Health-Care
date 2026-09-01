import { z } from 'zod';

export const documentScanStatusSchema = z.enum([
  'PENDING_SCAN',
  'CLEAN',
  'QUARANTINED',
  'REJECTED',
  'SCAN_FAILED',
]);
export type DocumentScanStatus = z.infer<typeof documentScanStatusSchema>;
export type DocumentScanRequest = Readonly<{
  bucketId: 'patient-documents';
  objectPath: string;
  documentId: string;
}>;
export type DocumentScanResult = Readonly<{
  status: Exclude<DocumentScanStatus, 'PENDING_SCAN'>;
  provider: string;
  failureCode?: string;
}>;
export interface MalwareScanner {
  scan(request: DocumentScanRequest): Promise<DocumentScanResult>;
}
export const unconfiguredMalwareScanner: MalwareScanner = {
  async scan() {
    throw new Error('Malware scanning is not configured');
  },
};
