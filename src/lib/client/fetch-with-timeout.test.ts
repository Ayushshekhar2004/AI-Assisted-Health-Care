import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchWithTimeout, RequestTimeoutError } from './fetch-with-timeout';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchWithTimeout', () => {
  it('allows a delayed response within the poor-network budget', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(() => resolve(new Response(null, { status: 200 })), 500),
          ),
      ),
    );

    const request = fetchWithTimeout('/synthetic', {}, 1_000);
    await vi.advanceTimersByTimeAsync(500);
    await expect(request).resolves.toMatchObject({ ok: true });
  });

  it('aborts a stalled provider request', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Synthetic abort', 'AbortError')),
          );
        });
      }),
    );

    const request = fetchWithTimeout('/synthetic', {}, 1_000);
    const assertion =
      expect(request).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });
});
