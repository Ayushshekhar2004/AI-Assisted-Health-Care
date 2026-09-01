import 'server-only';

import { getAIProvider } from '@/lib/ai/provider-config';

import type { ConsultationAIDraftModel } from './ai-draft';
import { OllamaConsultationDraftModel } from './ollama-draft-model';
import { OpenAIConsultationDraftModel } from './openai-draft-model';

export function createConsultationDraftModel(): ConsultationAIDraftModel {
  return getAIProvider() === 'ollama'
    ? new OllamaConsultationDraftModel()
    : new OpenAIConsultationDraftModel();
}
