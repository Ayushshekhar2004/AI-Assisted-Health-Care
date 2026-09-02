import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('public health endpoint', () => {
  it('returns liveness without dependency or deployment details', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
