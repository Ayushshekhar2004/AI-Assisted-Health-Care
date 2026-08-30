import { describe, expect, it } from 'vitest';

import { parseIntakeMessage, parseIntakeSessionId } from './validation';

describe('intake validation', () => {
  it('trims visible patient text', () => {
    expect(parseIntakeMessage('  Synthetic intake response.  ')).toBe(
      'Synthetic intake response.',
    );
  });

  it('rejects empty and oversized messages', () => {
    expect(() => parseIntakeMessage('   ')).toThrow();
    expect(() => parseIntakeMessage('x'.repeat(4001))).toThrow();
  });

  it('validates the opaque session identifier', () => {
    expect(parseIntakeSessionId('71000000-0000-4000-8000-000000000001')).toBe(
      '71000000-0000-4000-8000-000000000001',
    );
    expect(() => parseIntakeSessionId('not-a-session')).toThrow();
  });
});
