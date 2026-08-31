import { describe, expect, it } from 'vitest';

import { parseLiveKitConfig } from './livekit-config-validation';

describe('LiveKit configuration', () => {
  it('accepts server-only credentials with a secure WebSocket URL', () => {
    expect(
      parseLiveKitConfig({
        LIVEKIT_API_KEY: 'synthetic-key',
        LIVEKIT_API_SECRET: 'synthetic-secret-value',
        LIVEKIT_URL: 'wss://synthetic.livekit.invalid',
      }),
    ).toEqual({
      apiKey: 'synthetic-key',
      apiSecret: 'synthetic-secret-value',
      serverUrl: 'wss://synthetic.livekit.invalid',
    });
  });

  it('rejects missing secrets and insecure URLs', () => {
    expect(() =>
      parseLiveKitConfig({
        LIVEKIT_API_KEY: 'synthetic-key',
        LIVEKIT_API_SECRET: 'synthetic-secret-value',
        LIVEKIT_URL: 'ws://synthetic.livekit.invalid',
      }),
    ).toThrow();
    expect(() => parseLiveKitConfig({})).toThrow();
  });
});
