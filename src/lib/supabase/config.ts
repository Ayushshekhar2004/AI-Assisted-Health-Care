import { z } from 'zod';

const supabaseConfigSchema = z.object({
  url: z.string().url().refine((url) => url.startsWith('https://'), {
    message: 'Supabase URL must use HTTPS',
  }),
  publishableKey: z.string().min(1, 'Supabase publishable key is required'),
});

export type SupabaseConfig = z.infer<typeof supabaseConfigSchema>;

export function parseSupabaseConfig(input: unknown): SupabaseConfig {
  return supabaseConfigSchema.parse(input);
}

export function getSupabaseConfig(): SupabaseConfig {
  return parseSupabaseConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
