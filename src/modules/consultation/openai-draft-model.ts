import 'server-only';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { serializeUntrustedAIData } from '../../lib/ai/prompt-security';
import {
  CONSULTATION_AI_DRAFT_INSTRUCTIONS,
  consultationAIDraftOutputFormatSchema,
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
        {
          role: 'user',
          content: serializeUntrustedAIData(
            'consultation_draft_context',
            input,
          ),
        },
      ],
      tools: [],
      tool_choice: 'none',
      text: {
        format: zodTextFormat(
          consultationAIDraftOutputFormatSchema,
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
