import { describe, expect, it } from 'vitest';
import { emailCredentialsSchema } from './validation';

describe('emailCredentialsSchema', () => {
  it('normalizes valid credentials', () => {
    const result = emailCredentialsSchema.parse({
      email: ' synthetic.patient@example.invalid ',
      password: 'synthetic-password',
    });
    expect(result.email).toBe('synthetic.patient@example.invalid');
  });

  it('rejects malformed credentials', () => {
    expect(
      emailCredentialsSchema.safeParse({ email: 'invalid', password: 'short' })
        .success,
    ).toBe(false);
  });
});
