import { z } from 'zod';

const liveKitConfigSchema = z.object({
  apiKey: z.string().trim().min(3).max(200),
  apiSecret: z.string().trim().min(16).max(500),
  serverUrl: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === 'wss:', {
      message: 'LiveKit URL must use secure WebSockets',
    }),
});

export type LiveKitConfig = z.infer<typeof liveKitConfigSchema>;

export function parseLiveKitConfig(
  environment: Record<string, string | undefined>,
): LiveKitConfig {
  return liveKitConfigSchema.parse({
    apiKey: environment.LIVEKIT_API_KEY,
    apiSecret: environment.LIVEKIT_API_SECRET,
    serverUrl: environment.LIVEKIT_URL,
  });
}
