import { z } from 'zod';

const supabaseConfigSchema = z.object({
  url: z.string().url().refine((url) => url.startsWith('https://'), {
    message: 'Supabase URL must use HTTPS',
  }),
  publishableKey: z.string().min(1, 'Supabase publishable key is required'),
  siteUrl: z.string().url().refine(isSecureApplicationUrl, {
    message: 'Site URL must use HTTPS or loopback HTTP',
  }),
});

function isSecureApplicationUrl(value: string): boolean {
  const url = new URL(value);
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback);
}

export type SupabaseConfig = z.infer<typeof supabaseConfigSchema>;

export function parseSupabaseConfig(input: unknown): SupabaseConfig {
  return supabaseConfigSchema.parse(input);
}

export function getSupabaseConfig(): SupabaseConfig {
  return parseSupabaseConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
}
