import { describe, expect, it } from 'vitest';
import { getRoleHome, getSafeRedirectPath, isProtectedPath } from './redirects';

describe('role routing', () => {
  it.each([
    ['patient', '/patient'],
    ['doctor', '/doctor'],
    ['operations', '/admin'],
  ] as const)('maps %s to its area', (role, expected) => {
    expect(getRoleHome(role)).toBe(expected);
  });

  it('preserves safe internal redirects', () => {
    expect(getSafeRedirectPath('/patient?tab=appointments', '/patient')).toBe(
      '/patient?tab=appointments',
    );
  });

  it.each([
    'https://attacker.example',
    '//attacker.example',
    '/\\attacker.example',
    'patient',
    null,
  ])('rejects unsafe redirect %s', (value) =>
    expect(getSafeRedirectPath(value, '/patient')).toBe('/patient'),
  );

  it.each(['/patient', '/patient/appointments', '/doctor', '/admin/users'])(
    'recognizes protected path %s',
    (pathname) => expect(isProtectedPath(pathname)).toBe(true),
  );

  it.each(['/auth/login', '/patient-portal', '/', '/public/admin'])(
    'does not overmatch public path %s',
    (pathname) => expect(isProtectedPath(pathname)).toBe(false),
  );
});
