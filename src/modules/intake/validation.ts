import { z } from 'zod';

export const intakeSessionIdSchema = z.string().uuid();

const intakeMessageSchema = z
  .string()
  .trim()
  .min(1, 'Message is required')
  .max(4000, 'Message is too long');

export function parseIntakeSessionId(input: unknown): string {
  return intakeSessionIdSchema.parse(input);
}

export function parseIntakeMessage(input: unknown): string {
  return intakeMessageSchema.parse(input);
}
