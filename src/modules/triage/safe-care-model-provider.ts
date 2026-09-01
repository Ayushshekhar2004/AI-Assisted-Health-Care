import 'server-only';

import { getAIProvider } from '@/lib/ai/provider-config';

import { OllamaSafeCareClassificationModel } from './ollama-safe-care-model';
import { OpenAISafeCareClassificationModel } from './openai-safe-care-model';
import type { SafeCareClassificationModel } from './safe-care';

export function createSafeCareClassificationModel(): SafeCareClassificationModel {
  return getAIProvider() === 'ollama'
    ? new OllamaSafeCareClassificationModel()
    : new OpenAISafeCareClassificationModel();
}
