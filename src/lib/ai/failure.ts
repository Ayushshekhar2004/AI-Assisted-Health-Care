import { z } from 'zod';

import { writeSecurityLog } from '../security/logging';
import { isAIProviderError, type AIProviderErrorCode } from './provider-error';

export const aiWorkflowSchema = z.enum([
  'intake',
  'routing',
  'safe_care',
  'consultation_draft',
]);

export type AIWorkflow = z.infer<typeof aiWorkflowSchema>;
export type AIFailureCode = AIProviderErrorCode;

export class AIFailure extends Error {
  constructor(public readonly code: AIFailureCode) {
    super('AI assistance is temporarily unavailable');
    this.name = 'AIFailure';
  }
}

export function isAIFailure(error: unknown): error is AIFailure {
  return error instanceof AIFailure;
}

function normalizeFailure(error: unknown): AIFailure {
  if (isAIFailure(error)) return error;
  if (isAIProviderError(error)) return new AIFailure(error.code);
  if (error instanceof z.ZodError) return new AIFailure('INVALID_RESPONSE');
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error.name === 'string' &&
    /timeout/i.test(error.name)
  ) {
    return new AIFailure('TIMEOUT');
  }
  return new AIFailure('UNAVAILABLE');
}

export async function runAIWorkflow<T>(
  workflowInput: unknown,
  operation: () => Promise<T>,
): Promise<T> {
  const workflow = aiWorkflowSchema.parse(workflowInput);
  const startedAt = Date.now();
  try {
    const value = await operation();
    writeSecurityLog('ai.workflow', {
      category: workflow,
      durationMs: Date.now() - startedAt,
      outcome: 'success',
    });
    return value;
  } catch (error) {
    const failure = normalizeFailure(error);
    writeSecurityLog('ai.workflow', {
      category: workflow,
      durationMs: Date.now() - startedAt,
      outcome: failure.code.toLowerCase(),
    });
    throw failure;
  }
}

export function recordAILowConfidence(workflowInput: unknown): void {
  const workflow = aiWorkflowSchema.parse(workflowInput);
  writeSecurityLog('ai.workflow', {
    category: workflow,
    outcome: 'low_confidence_fallback',
  });
}
