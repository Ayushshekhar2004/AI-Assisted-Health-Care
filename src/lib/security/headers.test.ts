import { describe, expect, it } from 'vitest';

import { buildSecurityHeaders } from '../../../next.config';

function valueFor(
  headers: ReturnType<typeof buildSecurityHeaders>,
  key: string,
) {
  return headers.find((header) => header.key === key)?.value;
}

describe('transport security headers', () => {
  it('does not force HTTPS on the loopback development server', () => {
    const headers = buildSecurityHeaders(false);

    expect(valueFor(headers, 'Content-Security-Policy')).not.toContain(
      'upgrade-insecure-requests',
    );
    expect(valueFor(headers, 'Strict-Transport-Security')).toBeUndefined();
  });

  it('forces HTTPS in production responses', () => {
    const headers = buildSecurityHeaders(true);

    expect(valueFor(headers, 'Content-Security-Policy')).toContain(
      'upgrade-insecure-requests',
    );
    expect(valueFor(headers, 'Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });
});
