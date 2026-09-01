import Link from 'next/link';

import { getOwnPatientNotificationPreferences } from '@/modules/notification/server';

import { NotificationPreferencesForm } from './preferences-form';

export default async function NotificationPreferencesPage() {
  try {
    const preferences = await getOwnPatientNotificationPreferences();
    return (
      <main>
        <h1>Notification preferences</h1>
        <NotificationPreferencesForm {...preferences} />
        <p>
          <Link href="/patient">Back to patient area</Link>
        </p>
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Notification preferences</h1>
        <p>Notification preferences are temporarily unavailable.</p>
        <Link href="/patient">Back to patient area</Link>
      </main>
    );
  }
}
