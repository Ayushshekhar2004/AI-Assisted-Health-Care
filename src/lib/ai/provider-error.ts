export type AIProviderErrorCode =
  'INVALID_RESPONSE' | 'TIMEOUT' | 'UNAVAILABLE';

export class AIProviderError extends Error {
  constructor(public readonly code: AIProviderErrorCode) {
    super(
      code === 'UNAVAILABLE'
        ? 'Local AI service is unavailable'
        : code === 'TIMEOUT'
          ? 'Local AI service timed out'
          : 'Local AI response is invalid',
    );
    this.name = 'AIProviderError';
  }
}

export function isAIProviderError(error: unknown): error is AIProviderError {
  return (
    error instanceof AIProviderError ||
    (typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'AIProviderError' &&
      'code' in error &&
      (error.code === 'INVALID_RESPONSE' ||
        error.code === 'TIMEOUT' ||
        error.code === 'UNAVAILABLE'))
  );
}
