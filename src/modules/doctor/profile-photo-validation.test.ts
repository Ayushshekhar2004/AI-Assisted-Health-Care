import { describe, expect, it } from 'vitest';

import { parseProfilePhotoMetadata } from './profile-photo-validation';

describe('parseProfilePhotoMetadata', () => {
  it('accepts a small supported image', () => {
    expect(
      parseProfilePhotoMetadata({ size: 1024, type: 'image/webp' }),
    ).toEqual({
      size: 1024,
      type: 'image/webp',
    });
  });

  it('rejects oversized or unsupported content', () => {
    expect(() =>
      parseProfilePhotoMetadata({ size: 6 * 1024 * 1024, type: 'image/png' }),
    ).toThrow();
    expect(() =>
      parseProfilePhotoMetadata({ size: 1024, type: 'image/svg+xml' }),
    ).toThrow();
  });
});
