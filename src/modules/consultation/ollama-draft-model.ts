import 'server-only';

import { generateOllamaStructured } from '@/lib/ai/ollama-chat';
import { serializeUntrustedAIData } from '../../lib/ai/prompt-security';

import {
  CONSULTATION_AI_DRAFT_INSTRUCTIONS,
  consultationAIDraftOutputFormatSchema,
  consultationAIDraftOutputSchema,
  type ConsultationAIDraftInput,
  type ConsultationAIDraftModel,
} from './ai-draft';

export class OllamaConsultationDraftModel implements ConsultationAIDraftModel {
  async generate(input: ConsultationAIDraftInput): Promise<unknown> {
    const result = await generateOllamaStructured({
      schema: consultationAIDraftOutputFormatSchema,
      responseSchema: consultationAIDraftOutputSchema,
      schemaName: 'consultation_note_draft',
      messages: [
        { role: 'system', content: CONSULTATION_AI_DRAFT_INSTRUCTIONS },
        {
          role: 'user',
          content: serializeUntrustedAIData(
            'consultation_draft_context',
            input,
          ),
        },
      ],
    });
    return {
      modelName: result.model,
      modelVersion: result.modelVersion,
      output: result.output,
    };
  }
}
