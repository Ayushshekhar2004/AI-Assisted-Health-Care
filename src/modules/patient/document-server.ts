import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { validatePatientDocument } from './document-validation';

const appointmentIdSchema = z.string().uuid();
const documentRowSchema = z.object({
  id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  original_filename: z.string(),
  mime_type: z.string(),
  file_extension: z.string(),
  size_bytes: z.coerce.number().int(),
  created_at: z.string(),
  object_path: z.string(),
  bucket_id: z.literal('patient-documents'),
  scan_status: z
    .enum(['PENDING_SCAN', 'CLEAN', 'QUARANTINED', 'REJECTED', 'SCAN_FAILED'])
    .optional()
    .default('PENDING_SCAN'),
});

export type PatientDocument = Readonly<{
  id: string;
  appointmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  scanStatus:
    'PENDING_SCAN' | 'CLEAN' | 'QUARANTINED' | 'REJECTED' | 'SCAN_FAILED';
}>;

function present(row: z.infer<typeof documentRowSchema>): PatientDocument {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    filename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    scanStatus: row.scan_status,
  };
}

export async function uploadOwnPatientDocument(
  appointmentIdInput: unknown,
  file: File,
): Promise<string> {
  const appointmentId = appointmentIdSchema.parse(appointmentIdInput);
  const metadata = await validatePatientDocument(file);
  const documentId = randomUUID();
  const objectPath = `${await requireUserId()}/${documentId}.${metadata.extension}`;
  const supabase = await createClient();
  const uploaded = await supabase.storage
    .from('patient-documents')
    .upload(objectPath, file, {
      contentType: metadata.mimeType,
      upsert: false,
      cacheControl: '0',
    });
  if (uploaded.error) throw new Error('Document upload is unavailable');
  const registered = await supabase.rpc('register_patient_document', {
    p_document_id: documentId,
    p_appointment_id: appointmentId,
    p_object_path: objectPath,
    p_original_filename: metadata.name,
    p_mime_type: metadata.mimeType,
    p_file_extension: metadata.extension,
    p_size_bytes: metadata.size,
  });
  if (registered.error) {
    await supabase.storage.from('patient-documents').remove([objectPath]);
    throw new Error('Document upload is unavailable');
  }
  return documentId;
}

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user)
    throw new Error('Document upload is unavailable');
  return auth.data.user.id;
}

export async function listOwnPatientDocuments(
  appointmentIdInput: unknown,
): Promise<PatientDocument[]> {
  const supabase = await createClient();
  const result = await supabase.rpc('list_own_patient_documents', {
    p_appointment_id: appointmentIdSchema.parse(appointmentIdInput),
  });
  if (result.error) throw new Error('Documents are unavailable');
  return z
    .array(documentRowSchema)
    .parse(result.data ?? [])
    .map(present);
}

export async function createOwnPatientDocumentDownload(
  documentIdInput: unknown,
): Promise<{ url: string; filename: string }> {
  const supabase = await createClient();
  const result = await supabase.rpc('authorize_patient_document_download', {
    p_document_id: z.string().uuid().parse(documentIdInput),
  });
  if (result.error || !result.data?.[0])
    throw new Error('Document is unavailable');
  const row = documentRowSchema.parse(result.data[0]);
  const signed = await supabase.storage
    .from(row.bucket_id)
    .createSignedUrl(row.object_path, 60, { download: row.original_filename });
  if (signed.error) throw new Error('Document is unavailable');
  return { url: signed.data.signedUrl, filename: row.original_filename };
}

export async function listAssignedAppointmentDocuments(
  appointmentIdInput: unknown,
): Promise<PatientDocument[]> {
  const supabase = await createClient();
  const result = await supabase.rpc('list_assigned_appointment_documents', {
    p_appointment_id: appointmentIdSchema.parse(appointmentIdInput),
  });
  if (result.error) throw new Error('Documents are unavailable');
  return z
    .array(documentRowSchema)
    .parse(result.data ?? [])
    .map(present);
}

export async function createDoctorDocumentDownload(
  documentIdInput: unknown,
): Promise<string> {
  const supabase = await createClient();
  const result = await supabase.rpc('authorize_doctor_document_download', {
    p_document_id: z.string().uuid().parse(documentIdInput),
  });
  if (result.error || !result.data?.[0])
    throw new Error('Document is unavailable');
  const row = documentRowSchema.parse(result.data[0]);
  const signed = await supabase.storage
    .from(row.bucket_id)
    .createSignedUrl(row.object_path, 60, { download: row.original_filename });
  if (signed.error) throw new Error('Document is unavailable');
  return signed.data.signedUrl;
}
