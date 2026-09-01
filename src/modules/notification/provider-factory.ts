import 'server-only';

import { DevelopmentNotificationProvider } from './development-provider';
import { getNotificationProviderEnvironment } from './provider-config';
import type { NotificationProvider } from './provider';

export function createNotificationProvider(): NotificationProvider {
  getNotificationProviderEnvironment();
  return new DevelopmentNotificationProvider();
}
