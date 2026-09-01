import 'server-only';

import { getAIProvider } from '@/lib/ai/provider-config';

import type { SpecialtyRoutingModel } from './routing';
import { OllamaSpecialtyRoutingModel } from './ollama-routing-model';
import { OpenAISpecialtyRoutingModel } from './openai-routing-model';

export function createSpecialtyRoutingModel(): SpecialtyRoutingModel {
  return getAIProvider() === 'ollama'
    ? new OllamaSpecialtyRoutingModel()
    : new OpenAISpecialtyRoutingModel();
}
