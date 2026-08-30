import 'server-only';

import { z } from 'zod';

const openAIIntakeConfigSchema = z.object({
  apiKey: z.string().min(20),
  model: z.string().trim().min(1).max(120),
});

export function getOpenAIIntakeConfig() {
  return openAIIntakeConfigSchema.parse({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_INTAKE_MODEL,
  });
}
