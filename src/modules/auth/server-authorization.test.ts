import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const client = { auth: { getUser }, from };

vi.mock('../../lib/supabase/server', () => ({
  createClient: vi.fn(async () => client),
}));

import { createRoleAuthorizedClient } from './server-authorization';

describe('server role authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({
      data: { user: { id: '10000000-0000-4000-8000-000000000001' } },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: { role: 'patient' }, error: null });
  });

  it('returns the user-scoped client for an allowed role', async () => {
    await expect(
      createRoleAuthorizedClient(['patient'], 'Resource is unavailable'),
    ).resolves.toMatchObject({
      role: 'patient',
      userId: '10000000-0000-4000-8000-000000000001',
      supabase: client,
    });
  });

  it('rejects an authenticated user with the wrong role before resource access', async () => {
    maybeSingle.mockResolvedValue({ data: { role: 'doctor' }, error: null });

    await expect(
      createRoleAuthorizedClient(['patient'], 'Resource is unavailable'),
    ).rejects.toThrow('Resource is unavailable');
  });

  it('rejects unauthenticated and malformed-profile callers generically', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(
      createRoleAuthorizedClient(['doctor'], 'Resource is unavailable'),
    ).rejects.toThrow('Resource is unavailable');

    getUser.mockResolvedValue({
      data: { user: { id: '10000000-0000-4000-8000-000000000001' } },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: { role: 'admin' }, error: null });
    await expect(
      createRoleAuthorizedClient(['doctor'], 'Resource is unavailable'),
    ).rejects.toThrow('Resource is unavailable');
  });
});
