import type { ProfileRole } from './types';

const applicationOrigin = 'https://application.invalid';
const protectedAreaPattern = /^\/(?:patient|doctor|admin)(?:\/|$)/;

export function isProtectedPath(pathname: string): boolean {
  return protectedAreaPattern.test(pathname);
}

export function getRoleHome(role: ProfileRole): string {
  const homes: Record<ProfileRole, string> = {
    patient: '/patient',
    doctor: '/doctor',
    operations: '/admin',
  };
  return homes[role];
}

export function getSafeRedirectPath(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  try {
    const url = new URL(value, applicationOrigin);
    if (url.origin !== applicationOrigin || url.username || url.password) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
