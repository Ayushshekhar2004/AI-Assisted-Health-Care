import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { generateOllamaStructured } from './ollama-chat';

const originalEnvironment = { ...process.env };
const outputSchema = z.object({ answer: z.string() }).strict();

describe('generateOllamaStructured', () => {
  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  function configure() {
    process.env = {
      ...process.env,
      AI_PROVIDER: 'ollama',
      NODE_ENV: 'test',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
      OLLAMA_MODEL: 'synthetic-model',
    };
  }

  it('validates structured content and sends a non-streaming schema request', async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'synthetic-model',
          message: { role: 'assistant', content: '{"answer":"synthetic"}' },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateOllamaStructured({
        messages: [{ role: 'user', content: 'Synthetic request' }],
        schema: outputSchema,
        schemaName: 'synthetic_output',
      }),
    ).resolves.toEqual({
      model: 'synthetic-model',
      modelVersion: 'synthetic-model',
      output: { answer: 'synthetic' },
    });
    const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(request).toMatchObject({ stream: false, model: 'synthetic-model' });
    expect(request.tools).toEqual([]);
    expect(request.format).toMatchObject({ type: 'object' });
  });

  it.each([
    {
      message: { role: 'assistant', content: 'not-json' },
      model: 'synthetic-model',
    },
    {
      message: { role: 'assistant', content: '{"unexpected":true}' },
      model: 'synthetic-model',
    },
    { model: 'synthetic-model' },
  ])('rejects malformed Ollama responses', async (body) => {
    configure();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })),
    );
    await expect(
      generateOllamaStructured({
        messages: [{ role: 'user', content: 'Synthetic request' }],
        schema: outputSchema,
        schemaName: 'synthetic_output',
      }),
    ).rejects.toThrow('Local AI response is invalid');
  });

  it('rejects arbitrary model tool calls even when structured content is valid', async () => {
    configure();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: 'synthetic-model',
            message: {
              role: 'assistant',
              content: '{"answer":"synthetic"}',
              tool_calls: [
                { function: { name: 'finalize_prescription', arguments: {} } },
              ],
            },
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(
      generateOllamaStructured({
        messages: [{ role: 'user', content: 'Synthetic request' }],
        schema: outputSchema,
        schemaName: 'synthetic_output',
      }),
    ).rejects.toThrow('Local AI response is invalid');
  });

  it('retries one malformed structured response without echoing it', async () => {
    configure();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: 'synthetic-model',
            message: { role: 'assistant', content: 'malformed private output' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: 'synthetic-model',
            message: { role: 'assistant', content: '{"answer":"corrected"}' },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateOllamaStructured({
        messages: [{ role: 'user', content: 'Synthetic request' }],
        schema: outputSchema,
        schemaName: 'synthetic_output',
      }),
    ).resolves.toMatchObject({ output: { answer: 'corrected' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(JSON.stringify(retryBody)).not.toContain('malformed private output');
    expect(JSON.stringify(retryBody)).toContain(
      'prior output failed validation',
    );
  });

  it('retries a response that passes the format schema but fails semantic validation', async () => {
    configure();
    const semanticSchema = outputSchema.refine(
      (value) => value.answer === 'safe',
      'Synthetic semantic rule',
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: 'synthetic-model',
            message: { role: 'assistant', content: '{"answer":"unsafe"}' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: 'synthetic-model',
            message: { role: 'assistant', content: '{"answer":"safe"}' },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      generateOllamaStructured({
        messages: [{ role: 'user', content: 'Synthetic request' }],
        schema: outputSchema,
        responseSchema: semanticSchema,
        schemaName: 'synthetic_output',
      }),
    ).resolves.toMatchObject({ output: { answer: 'safe' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns a generic error for timeout/network failures', async () => {
    configure();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection details')),
    );
    await expect(
      generateOllamaStructured({
        messages: [{ role: 'user', content: 'Synthetic request' }],
        schema: outputSchema,
        schemaName: 'synthetic_output',
      }),
    ).rejects.toThrow('Local AI service is unavailable');
  });

  it('categorizes a timeout without exposing transport details', async () => {
    configure();
    const timeout = new Error('private transport details');
    timeout.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));
    await expect(
      generateOllamaStructured({
        messages: [{ role: 'user', content: 'Synthetic request' }],
        schema: outputSchema,
        schemaName: 'synthetic_output',
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
