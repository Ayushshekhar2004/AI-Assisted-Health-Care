import { z } from 'zod';

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const availabilityIdSchema = z.string().uuid();

const availabilityInputSchema = z.object({
  startsAtIso: isoDateTimeSchema,
  endsAtIso: isoDateTimeSchema,
});

export type AvailabilityInput = Readonly<{
  startsAtIso: string;
  endsAtIso: string;
}>;

export function parseAvailabilityInput(
  input: unknown,
  now: Date = new Date(),
): AvailabilityInput {
  const parsed = availabilityInputSchema.parse(input);
  const startsAt = new Date(parsed.startsAtIso);
  const endsAt = new Date(parsed.endsAtIso);
  const durationMs = endsAt.getTime() - startsAt.getTime();

  if (
    startsAt.getTime() <= now.getTime() ||
    durationMs <= 0 ||
    durationMs > 24 * 60 * 60 * 1000
  ) {
    throw new Error('Availability is invalid');
  }

  return parsed;
}

export function parseAvailabilityId(input: unknown): string {
  return availabilityIdSchema.parse(input);
}
