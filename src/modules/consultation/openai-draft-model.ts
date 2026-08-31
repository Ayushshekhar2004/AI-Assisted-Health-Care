import 'server-only';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  CONSULTATION_AI_DRAFT_INSTRUCTIONS,
  consultationAIDraftOutputSchema,
  type ConsultationAIDraftInput,
  type ConsultationAIDraftModel,
} from './ai-draft';
import { getOpenAIConsultationDraftConfig } from './openai-draft-config';

export class OpenAIConsultationDraftModel implements ConsultationAIDraftModel {
  async generate(input: ConsultationAIDraftInput): Promise<unknown> {
    const { apiKey, model } = getOpenAIConsultationDraftConfig();
    const response = await new OpenAI({ apiKey }).responses.parse({
      model,
      store: false,
      max_output_tokens: 1400,
      input: [
        { role: 'developer', content: CONSULTATION_AI_DRAFT_INSTRUCTIONS },
        { role: 'user', content: JSON.stringify(input) },
      ],
      text: {
        format: zodTextFormat(
          consultationAIDraftOutputSchema,
          'consultation_note_draft',
        ),
      },
    });
    if (!response.output_parsed) throw new Error('AI draft is unavailable');
    return {
      modelName: model,
      modelVersion: response.model,
      output: response.output_parsed,
    };
  }
}
