import 'server-only';

import { z } from 'zod';

const openAIRoutingConfigSchema = z.object({
  apiKey: z.string().min(20),
  model: z.string().trim().min(1).max(120),
});

export function getOpenAIRoutingConfig() {
  return openAIRoutingConfigSchema.parse({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_ROUTING_MODEL,
  });
}
