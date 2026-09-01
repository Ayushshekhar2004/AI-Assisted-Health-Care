import type { NotificationDelivery } from './notification';

export type NotificationProviderResult = Readonly<{
  providerMessageId: string;
}>;

export interface NotificationProvider {
  /** Providers must pass delivery.idempotencyKey to their upstream API. */
  send(delivery: NotificationDelivery): Promise<NotificationProviderResult>;
}
