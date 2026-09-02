import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AIProviderError } from './provider-error';
import { isAIFailure, recordAILowConfidence, runAIWorkflow } from './failure';

describe('AI failure telemetry', () => {
  it.each([
    [new AIProviderError('TIMEOUT'), 'TIMEOUT'],
    [new AIProviderError('UNAVAILABLE'), 'UNAVAILABLE'],
    [new AIProviderError('INVALID_RESPONSE'), 'INVALID_RESPONSE'],
    [new z.ZodError([]), 'INVALID_RESPONSE'],
  ] as const)(
    'normalizes failures without logging payloads',
    async (error, code) => {
      const info = vi
        .spyOn(console, 'info')
        .mockImplementation(() => undefined);
      const caught = await runAIWorkflow('intake', async () => {
        throw error;
      }).catch((value: unknown) => value);
      expect(isAIFailure(caught)).toBe(true);
      expect(caught).toMatchObject({ code });
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining(`"outcome":"${code.toLowerCase()}"`),
      );
      expect(info.mock.calls[0]?.[0]).not.toContain('patient');
      info.mockRestore();
    },
  );

  it('records a categorical low-confidence fallback only', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    recordAILowConfidence('routing');
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toEqual({
      event: 'ai.workflow',
      category: 'routing',
      outcome: 'low_confidence_fallback',
    });
    info.mockRestore();
  });
});
