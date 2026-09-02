import { z } from 'zod';

import { getMonitoringConfig } from './config';

const identifierHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const durationSchema = z.number().int().nonnegative().max(3_600_000);

export const operationalMetricSchema = z.discriminatedUnion('event', [
  z
    .object({
      event: z.literal('request.error'),
      category: z.enum(['csrf', 'rate_limit', 'request_size', 'server']),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      status: z.number().int().min(400).max(599),
    })
    .strict(),
  z
    .object({
      event: z.literal('auth.failure'),
      category: z.enum(['login', 'sign_up']),
      outcome: z.enum([
        'csrf',
        'invalid_input',
        'credentials',
        'role',
        'provider',
      ]),
    })
    .strict(),
  z
    .object({
      event: z.literal('appointment.booking_failure'),
      category: z.enum(['standard', 'follow_up']),
      outcome: z.enum([
        'invalid_input',
        'authorization',
        'conflict',
        'database',
      ]),
      identifierHash: identifierHashSchema.optional(),
    })
    .strict(),
  z
    .object({
      event: z.literal('ai.workflow'),
      category: z.enum([
        'intake',
        'routing',
        'safe_care',
        'consultation_draft',
      ]),
      durationMs: durationSchema.optional(),
      outcome: z.enum([
        'success',
        'timeout',
        'invalid_response',
        'unavailable',
        'low_confidence_fallback',
      ]),
    })
    .strict(),
  z
    .object({
      event: z.literal('routing.fallback'),
      category: z.enum([
        'LOW_CONFIDENCE',
        'INSUFFICIENT_DATA',
        'MULTI_SYSTEM',
        'RED_FLAG',
        'AI_TIMEOUT',
        'INVALID_AI_OUTPUT',
        'PROVIDER_UNAVAILABLE',
      ]),
      outcome: z.literal('general_medicine'),
    })
    .strict(),
  z
    .object({
      event: z.literal('video_token.error'),
      category: z.enum(['csrf', 'invalid_input', 'authorization', 'provider']),
      status: z.number().int().min(400).max(599),
      identifierHash: identifierHashSchema.optional(),
    })
    .strict(),
  z
    .object({
      event: z.literal('notification.failure'),
      category: z.enum(['claim', 'delivery', 'finalize']),
      outcome: z.enum(['database', 'provider', 'invalid_response']),
      identifierHash: identifierHashSchema.optional(),
    })
    .strict(),
]);

export type OperationalMetric = z.infer<typeof operationalMetricSchema>;

export interface OperationalMonitoringProvider {
  record(metric: OperationalMetric): void;
}

export const failureEventSchema = z.enum([
  'request.error',
  'auth.failure',
  'appointment.booking_failure',
  'ai.workflow',
  'routing.fallback',
  'video_token.error',
  'notification.failure',
]);

export type FailureEvent = z.infer<typeof failureEventSchema>;

export function isFailureMetric(metric: OperationalMetric): boolean {
  return metric.event !== 'ai.workflow' || metric.outcome !== 'success';
}

export class RecentFailureCounter {
  private readonly events: Array<
    Readonly<{ event: FailureEvent; at: number }>
  > = [];

  add(metric: OperationalMetric, now = Date.now()): void {
    if (!isFailureMetric(metric)) return;
    this.events.push({ event: metric.event, at: now });
    this.prune(now);
  }

  counts(now = Date.now(), windowMs = 15 * 60_000) {
    this.prune(now, windowMs);
    const counts = new Map<FailureEvent, number>();
    for (const item of this.events) {
      counts.set(item.event, (counts.get(item.event) ?? 0) + 1);
    }
    return Array.from(counts, ([event, count]) => ({ event, count })).sort(
      (left, right) => left.event.localeCompare(right.event),
    );
  }

  private prune(now: number, windowMs = 15 * 60_000): void {
    const cutoff = now - windowMs;
    while (this.events[0] && this.events[0].at < cutoff) this.events.shift();
  }
}

export function recordOperationalMetric(
  input: unknown,
  provider: OperationalMonitoringProvider,
): void {
  provider.record(operationalMetricSchema.parse(input));
}

export async function hashMonitoringIdentifier(
  identifier: string,
  salt = getMonitoringConfig().hashSalt,
): Promise<string> {
  const parsedIdentifier = z.string().uuid().parse(identifier);
  const parsedSalt = z.string().min(32).parse(salt);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${parsedSalt}:${parsedIdentifier}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
