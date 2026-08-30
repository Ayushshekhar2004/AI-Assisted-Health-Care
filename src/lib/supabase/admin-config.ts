import 'server-only';

import { z } from 'zod';

import { isSecureOrLoopbackUrl } from './config';

const adminConfigSchema = z.object({
  secretKey: z.string().min(20),
  url: z.string().url().refine(isSecureOrLoopbackUrl),
});

export function getSupabaseAdminConfig() {
  return adminConfigSchema.parse({
    secretKey: process.env.SUPABASE_SECRET_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}
