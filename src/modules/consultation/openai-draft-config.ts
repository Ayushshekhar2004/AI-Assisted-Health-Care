import 'server-only';
import { z } from 'zod';
const schema = z.object({
  apiKey: z.string().min(20),
  model: z.string().trim().min(1).max(120),
});
export function getOpenAIConsultationDraftConfig() {
  return schema.parse({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_CONSULTATION_MODEL,
  });
}
