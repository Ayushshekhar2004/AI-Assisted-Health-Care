import 'server-only';

import { z } from 'zod';

const notificationProviderEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    NOTIFICATION_PROVIDER: z.literal('development').default('development'),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['NOTIFICATION_PROVIDER'],
        message:
          'The development notification provider is not allowed in production',
      });
    }
  });

export function parseNotificationProviderEnvironment(
  environment: Record<string, string | undefined>,
) {
  return notificationProviderEnvironmentSchema.parse(environment);
}

export function getNotificationProviderEnvironment() {
  return parseNotificationProviderEnvironment({
    NODE_ENV: process.env.NODE_ENV,
    NOTIFICATION_PROVIDER: process.env.NOTIFICATION_PROVIDER,
  });
}
