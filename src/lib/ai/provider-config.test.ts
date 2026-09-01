import { describe, expect, it } from 'vitest';
import { getAIProvider, getOllamaConfig } from './provider-config';

describe('AI provider configuration', () => {
  it('keeps OpenAI as the backwards-compatible default', () => {
    expect(getAIProvider({})).toBe('openai');
    expect(getAIProvider({ AI_PROVIDER: 'ollama' })).toBe('ollama');
  });

  it('accepts a local Ollama development server', () => {
    expect(
      getOllamaConfig({
        AI_PROVIDER: 'ollama',
        NODE_ENV: 'development',
        OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
        OLLAMA_MODEL: 'synthetic-model',
      }),
    ).toEqual({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'synthetic-model',
    });
  });

  it('accepts an explicitly configured RFC1918 LAN address in development', () => {
    expect(
      getOllamaConfig({
        AI_PROVIDER: 'ollama',
        NODE_ENV: 'development',
        OLLAMA_BASE_URL: 'http://192.168.1.25:11434',
        OLLAMA_MODEL: 'synthetic-model',
      }),
    ).toEqual({
      baseUrl: 'http://192.168.1.25:11434',
      model: 'synthetic-model',
    });
  });

  it('rejects production and non-local Ollama endpoints', () => {
    const base = {
      AI_PROVIDER: 'ollama',
      OLLAMA_MODEL: 'synthetic-model',
    };
    expect(() =>
      getOllamaConfig({
        ...base,
        NODE_ENV: 'production',
        OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
      }),
    ).toThrow();
    expect(() =>
      getOllamaConfig({
        ...base,
        NODE_ENV: 'development',
        OLLAMA_BASE_URL: 'https://8.8.8.8:11434',
      }),
    ).toThrow('private-LAN');
  });
});
