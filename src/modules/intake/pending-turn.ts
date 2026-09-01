import { z } from 'zod';

const visibleIntakeRoleSchema = z.enum(['patient', 'assistant']).nullable();

export function hasPendingPatientTurn(lastRole: unknown): boolean {
  return visibleIntakeRoleSchema.parse(lastRole) === 'patient';
}
