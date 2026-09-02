import { z } from 'zod';

type RateLimitEntry = { count: number; resetAt: number };
const counters = new Map<string, RateLimitEntry>();
const MAX_TRACKED_KEYS = 10_000;

export const rateLimitPolicySchema = z.object({
  limit: z.number().int().positive().max(10_000),
  windowMs: z
    .number()
    .int()
    .positive()
    .max(24 * 60 * 60 * 1000),
});

export type RateLimitPolicy = z.infer<typeof rateLimitPolicySchema>;

export function checkRateLimit(
  key: string,
  input: RateLimitPolicy,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  const policy = rateLimitPolicySchema.parse(input);
  const existing = counters.get(key);
  if (!existing || existing.resetAt <= now) {
    if (counters.size >= MAX_TRACKED_KEYS) {
      for (const [candidate, entry] of counters) {
        if (entry.resetAt <= now) counters.delete(candidate);
      }
      if (counters.size >= MAX_TRACKED_KEYS)
        counters.delete(counters.keys().next().value!);
    }
    counters.set(key, { count: 1, resetAt: now + policy.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= policy.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      ),
    };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimitsForTests(): void {
  counters.clear();
}
