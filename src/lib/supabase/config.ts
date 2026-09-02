import { z } from 'zod';

export const applicationEnvironmentSchema = z.enum([
  'development',
  'staging',
  'production',
]);

const supabaseConfigSchema = z
  .object({
    appEnvironment: applicationEnvironmentSchema,
    serverEnvironment: applicationEnvironmentSchema.optional(),
    projectRef: z.string().regex(/^(?:local|[a-z0-9]{8,40})$/),
    resourceNamespace: z.string().regex(/^[a-z0-9-]{3,100}$/),
    url: z.string().url().refine(isSecureOrLoopbackUrl, {
      message: 'Supabase URL must use HTTPS or loopback HTTP',
    }),
    publishableKey: z.string().min(1, 'Supabase publishable key is required'),
    siteUrl: z.string().url().refine(isSecureOrLoopbackUrl, {
      message: 'Site URL must use HTTPS or loopback HTTP',
    }),
  })
  .superRefine((value, context) => {
    if (
      value.serverEnvironment &&
      value.serverEnvironment !== value.appEnvironment
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Server and public environment markers do not match',
        path: ['serverEnvironment'],
      });
    }
    const url = new URL(value.url);
    const expectedNamespace = `${value.appEnvironment}-${value.projectRef}`;
    if (value.resourceNamespace !== expectedNamespace) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Resource namespace does not match this environment',
        path: ['resourceNamespace'],
      });
    }
    if (value.appEnvironment === 'development') {
      if (value.projectRef !== 'local' || !isLoopbackHostname(url.hostname)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Development must use the local Supabase project',
          path: ['url'],
        });
      }
      return;
    }
    if (
      value.projectRef === 'local' ||
      url.protocol !== 'https:' ||
      url.hostname !== `${value.projectRef}.supabase.co`
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Hosted environment must match its Supabase project reference',
        path: ['projectRef'],
      });
    }
    if (new URL(value.siteUrl).protocol !== 'https:') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Hosted environments require an HTTPS site URL',
        path: ['siteUrl'],
      });
    }
  })
  .transform((value) => ({
    appEnvironment: value.appEnvironment,
    projectRef: value.projectRef,
    resourceNamespace: value.resourceNamespace,
    url: value.url,
    publishableKey: value.publishableKey,
    siteUrl: value.siteUrl,
  }));

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function isSecureOrLoopbackUrl(value: string): boolean {
  const url = new URL(value);
  const isLoopback = isLoopbackHostname(url.hostname);
  return url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback);
}

export type SupabaseConfig = z.infer<typeof supabaseConfigSchema>;

export function parseSupabaseConfig(input: unknown): SupabaseConfig {
  return supabaseConfigSchema.parse(input);
}

export function getSupabaseConfig(): SupabaseConfig {
  return parseSupabaseConfig({
    appEnvironment: process.env.NEXT_PUBLIC_APP_ENV,
    serverEnvironment: process.env.APP_ENV,
    projectRef: process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF,
    resourceNamespace: process.env.NEXT_PUBLIC_RESOURCE_NAMESPACE,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
}
