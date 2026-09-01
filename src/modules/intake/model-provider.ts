import 'server-only';

import { getAIProvider } from '@/lib/ai/provider-config';

import type { IntakeModel } from './orchestrator';
import { OllamaIntakeModel } from './ollama-model';
import { OpenAIIntakeModel } from './openai-model';

export function createIntakeModel(): IntakeModel {
  return getAIProvider() === 'ollama'
    ? new OllamaIntakeModel()
    : new OpenAIIntakeModel();
}
