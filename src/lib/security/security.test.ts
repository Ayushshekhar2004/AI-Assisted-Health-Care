import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseSecurityConfig } from './config';
import { redactLogFields, writeSecurityLog } from './logging';
import { checkRateLimit, resetRateLimitsForTests } from './rate-limit';
import { isJsonRequest, isSameOriginRequest, readLimitedJson } from './request';

describe('web security boundaries', () => {
  beforeEach(resetRateLimitsForTests);

  it('accepts exact same-origin JSON and rejects cross-origin or ambiguous requests', () => {
    expect(
      isSameOriginRequest('https://care.example', 'https://care.example/path'),
    ).toBe(true);
    expect(
      isSameOriginRequest('https://evil.example', 'https://care.example'),
    ).toBe(false);
    expect(isSameOriginRequest(null, 'https://care.example')).toBe(false);
    expect(isJsonRequest('application/json; charset=utf-8')).toBe(true);
    expect(isJsonRequest('text/plain')).toBe(false);
  });

  it('rejects oversized declared and streamed JSON bodies', async () => {
    const declared = new Request('https://care.example/api', {
      method: 'POST',
      body: '{}',
      headers: { 'content-length': '100' },
    });
    await expect(readLimitedJson(declared, 10)).rejects.toThrow();

    const streamed = new Request('https://care.example/api', {
      method: 'POST',
      body: JSON.stringify({ value: 'synthetic-value' }),
    });
    await expect(readLimitedJson(streamed, 8)).rejects.toThrow();
  });

  it('parses bounded JSON bodies', async () => {
    const request = new Request('https://care.example/api', {
      method: 'POST',
      body: JSON.stringify({ appointmentId: 'synthetic-id' }),
    });
    await expect(readLimitedJson(request, 128)).resolves.toEqual({
      appointmentId: 'synthetic-id',
    });
  });

  it('enforces a fixed request budget without exposing the key', () => {
    expect(
      checkRateLimit('opaque-key', { limit: 2, windowMs: 1_000 }, 0).allowed,
    ).toBe(true);
    expect(
      checkRateLimit('opaque-key', { limit: 2, windowMs: 1_000 }, 1).allowed,
    ).toBe(true);
    expect(
      checkRateLimit('opaque-key', { limit: 2, windowMs: 1_000 }, 2),
    ).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(
      checkRateLimit('opaque-key', { limit: 2, windowMs: 1_000 }, 1_001)
        .allowed,
    ).toBe(true);
  });

  it('requires a strong rate-limit salt in production', () => {
    expect(() =>
      parseSecurityConfig({ nodeEnvironment: 'production' }),
    ).toThrow();
    expect(() =>
      parseSecurityConfig({
        nodeEnvironment: 'production',
        rateLimitSalt: 'short',
      }),
    ).toThrow();
    expect(
      parseSecurityConfig({
        nodeEnvironment: 'production',
        rateLimitSalt: 'a'.repeat(32),
      }),
    ).toMatchObject({ nodeEnvironment: 'production' });
  });

  it('redacts secrets and arbitrary values before structured logging', () => {
    expect(
      redactLogFields({
        status: 429,
        accessToken: 'synthetic-secret',
        patientMessage: 'synthetic clinical text',
        nested: { unsafe: true },
      }),
    ).toEqual({
      status: 429,
      accessToken: '[REDACTED]',
      patientMessage: '[REDACTED]',
      nested: '[REDACTED]',
    });

    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    writeSecurityLog('request.rejected', { authorization: 'synthetic' });
    expect(info).toHaveBeenCalledWith(
      '{"event":"request.rejected","authorization":"[REDACTED]"}',
    );
    info.mockRestore();
  });
});
