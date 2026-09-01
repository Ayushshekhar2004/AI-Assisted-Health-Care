import 'server-only';

import { zodTextFormat } from 'openai/helpers/zod';
import { z, type ZodType } from 'zod';

import { getOllamaConfig } from './provider-config';

const OLLAMA_TIMEOUT_MS = 30_000;
const OLLAMA_MAX_STRUCTURED_ATTEMPTS = 2;

export type AIProviderErrorCode = 'INVALID_RESPONSE' | 'UNAVAILABLE';

export class AIProviderError extends Error {
  constructor(public readonly code: AIProviderErrorCode) {
    super(
      code === 'UNAVAILABLE'
        ? 'Local AI service is unavailable'
        : 'Local AI response is invalid',
    );
    this.name = 'AIProviderError';
  }
}

export function isAIProviderError(error: unknown): error is AIProviderError {
  return (
    error instanceof AIProviderError ||
    (typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'AIProviderError' &&
      'code' in error &&
      (error.code === 'INVALID_RESPONSE' || error.code === 'UNAVAILABLE'))
  );
}

const ollamaChatResponseSchema = z
  .object({
    model: z.string().trim().min(1).max(120),
    message: z
      .object({
        role: z.literal('assistant'),
        content: z.string().min(1).max(100_000),
      })
      .passthrough(),
  })
  .passthrough();

export type OllamaChatMessage = Readonly<{
  role: 'system' | 'user' | 'assistant';
  content: string;
}>;

export async function generateOllamaStructured<T>({
  messages,
  responseSchema,
  schema,
  schemaName,
}: Readonly<{
  messages: readonly OllamaChatMessage[];
  responseSchema?: ZodType<T>;
  schema: ZodType<T>;
  schemaName: string;
}>): Promise<{ model: string; modelVersion: string; output: T }> {
  const { baseUrl, model } = getOllamaConfig();
  const format = zodTextFormat(schema, schemaName);
  const schemaInstruction = `Return only JSON matching this schema exactly: ${JSON.stringify(format.schema)}`;

  for (
    let attempt = 1;
    attempt <= OLLAMA_MAX_STRUCTURED_ATTEMPTS;
    attempt += 1
  ) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            ...messages,
            { role: 'system', content: schemaInstruction },
            ...(attempt > 1
              ? [
                  {
                    role: 'system' as const,
                    content:
                      'The prior output failed validation. Return a corrected JSON object only. Do not add commentary or markdown.',
                  },
                ]
              : []),
          ],
          stream: false,
          format: format.schema,
          options: { temperature: 0 },
        }),
        signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch {
      throw new AIProviderError('UNAVAILABLE');
    }

    if (!response.ok) throw new AIProviderError('UNAVAILABLE');

    try {
      const parsed = ollamaChatResponseSchema.parse(await response.json());
      return {
        model,
        modelVersion: parsed.model,
        output: (responseSchema ?? schema).parse(
          JSON.parse(parsed.message.content),
        ),
      };
    } catch {
      if (attempt === OLLAMA_MAX_STRUCTURED_ATTEMPTS) {
        throw new AIProviderError('INVALID_RESPONSE');
      }
    }
  }

  throw new AIProviderError('INVALID_RESPONSE');
}
