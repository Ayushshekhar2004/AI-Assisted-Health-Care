import { describe, expect, it } from 'vitest';

import { parseServerEnvironment } from './env';

describe('parseServerEnvironment', () => {
  it('uses development when NODE_ENV is absent', () => {
    expect(parseServerEnvironment({})).toEqual({ NODE_ENV: 'development' });
  });

  it('accepts supported environments', () => {
    expect(parseServerEnvironment({ NODE_ENV: 'test' })).toEqual({
      NODE_ENV: 'test',
    });
  });

  it('rejects unsupported environments', () => {
    expect(() => parseServerEnvironment({ NODE_ENV: 'staging' })).toThrow();
  });
});
