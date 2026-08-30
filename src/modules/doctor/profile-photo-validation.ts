import { z } from 'zod';

const profilePhotoMetadataSchema = z.object({
  size: z.number().int().positive().max(5 * 1024 * 1024),
  type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

export function parseProfilePhotoMetadata(input: unknown) {
  return profilePhotoMetadataSchema.parse(input);
}
