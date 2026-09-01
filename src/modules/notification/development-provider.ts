import 'server-only';

import type { NotificationDelivery } from './notification';
import type {
  NotificationProvider,
  NotificationProviderResult,
} from './provider';

export class DevelopmentNotificationProvider implements NotificationProvider {
  async send(
    delivery: NotificationDelivery,
  ): Promise<NotificationProviderResult> {
    // Development delivery is intentionally a no-op. Do not log content or recipients.
    return { providerMessageId: `development-${delivery.idempotencyKey}` };
  }
}
