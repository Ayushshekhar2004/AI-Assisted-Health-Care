import 'server-only';

import { z } from 'zod';

export const aiProviderSchema = z.enum(['openai', 'ollama']);
export type AIProvider = z.infer<typeof aiProviderSchema>;

function isPrivateDevelopmentHost(hostname: string): boolean {
  if (['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) return true;
  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

const ollamaEnvironmentSchema = z
  .object({
    AI_PROVIDER: z.literal('ollama'),
    NODE_ENV: z.enum(['development', 'test']).default('development'),
    OLLAMA_BASE_URL: z.string().url(),
    OLLAMA_MODEL: z.string().trim().min(1).max(120),
  })
  .transform(({ OLLAMA_BASE_URL, OLLAMA_MODEL }) => {
    const url = new URL(OLLAMA_BASE_URL);
    if (
      !isPrivateDevelopmentHost(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      throw new Error('Ollama must use a local or private-LAN server URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Ollama URL protocol is invalid');
    }
    return {
      baseUrl: url.toString().replace(/\/$/, ''),
      model: OLLAMA_MODEL,
    };
  });

export function getAIProvider(
  environment: Record<string, string | undefined> = process.env,
): AIProvider {
  return aiProviderSchema.parse(environment.AI_PROVIDER ?? 'openai');
}

export function getOllamaConfig(
  environment: Record<string, string | undefined> = process.env,
) {
  return ollamaEnvironmentSchema.parse({
    AI_PROVIDER: environment.AI_PROVIDER,
    NODE_ENV: environment.NODE_ENV,
    OLLAMA_BASE_URL: environment.OLLAMA_BASE_URL,
    OLLAMA_MODEL: environment.OLLAMA_MODEL,
  });
}
