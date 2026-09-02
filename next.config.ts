import type { NextConfig } from 'next';

const baseContentSecurityPolicy =
  "default-src 'self'; base-uri 'self'; connect-src 'self' https: wss:; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' blob: data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'";

export function buildSecurityHeaders(isProduction: boolean) {
  const headers = [
    {
      key: 'Content-Security-Policy',
      value: `${baseContentSecurityPolicy}${isProduction ? '; upgrade-insecure-requests' : ''}`,
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(self), microphone=(self), geolocation=()',
    },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
  ];
  if (isProduction) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains',
    });
  }
  return headers;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders(process.env.NODE_ENV === 'production'),
      },
    ];
  },
};

export default nextConfig;
