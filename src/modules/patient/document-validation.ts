import { z } from 'zod';

export const MAX_PATIENT_DOCUMENT_BYTES = 10 * 1024 * 1024;

const typeExtensionSchema = z.discriminatedUnion('mimeType', [
  z.object({
    mimeType: z.literal('application/pdf'),
    extension: z.literal('pdf'),
  }),
  z.object({
    mimeType: z.literal('image/jpeg'),
    extension: z.enum(['jpg', 'jpeg']),
  }),
  z.object({ mimeType: z.literal('image/png'), extension: z.literal('png') }),
  z.object({ mimeType: z.literal('image/webp'), extension: z.literal('webp') }),
]);

export const patientDocumentMetadataSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/^[^/\\\u0000-\u001f\u007f]+$/),
    size: z.number().int().positive().max(MAX_PATIENT_DOCUMENT_BYTES),
    type: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  })
  .transform(({ name, size, type }) => {
    const extension = name.split('.').pop()?.toLowerCase() ?? '';
    const matched = typeExtensionSchema.parse({ mimeType: type, extension });
    return {
      extension: matched.extension,
      mimeType: matched.mimeType,
      name,
      size,
    };
  });

function hasSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'application/pdf')
    return (
      bytes.length >= 5 &&
      new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
    );
  if (mimeType === 'image/jpeg')
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png')
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  return (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  );
}

export async function validatePatientDocument(file: File) {
  const metadata = patientDocumentMetadataSchema.parse({
    name: file.name,
    size: file.size,
    type: file.type,
  });
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!hasSignature(header, metadata.mimeType))
    throw new Error('File content does not match its declared type');
  return metadata;
}
