import 'server-only';

import { generateOllamaStructured } from '@/lib/ai/ollama-chat';

import {
  CONSULTATION_AI_DRAFT_INSTRUCTIONS,
  consultationAIDraftOutputSchema,
  type ConsultationAIDraftInput,
  type ConsultationAIDraftModel,
} from './ai-draft';

export class OllamaConsultationDraftModel implements ConsultationAIDraftModel {
  async generate(input: ConsultationAIDraftInput): Promise<unknown> {
    const result = await generateOllamaStructured({
      schema: consultationAIDraftOutputSchema,
      schemaName: 'consultation_note_draft',
      messages: [
        { role: 'system', content: CONSULTATION_AI_DRAFT_INSTRUCTIONS },
        { role: 'user', content: JSON.stringify(input) },
      ],
    });
    return {
      modelName: result.model,
      modelVersion: result.modelVersion,
      output: result.output,
    };
  }
}
