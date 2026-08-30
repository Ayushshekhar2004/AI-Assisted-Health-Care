import Link from 'next/link';

import { listOwnDoctorAvailability } from '@/modules/scheduling/server';

import { AvailabilityEditor } from './availability-editor';

export default async function DoctorAvailabilityPage() {
  try {
    const slots = await listOwnDoctorAvailability();
    return (
      <main>
        <h1>Availability</h1>
        <p>Times are entered and displayed in your current device timezone.</p>
        <AvailabilityEditor slots={slots} />
        <p>
          <Link href="/doctor">Back to doctor area</Link>
        </p>
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Availability</h1>
        <p>
          Availability is unavailable. Only verified, bookable doctors can add
          slots.
        </p>
        <p>
          <Link href="/doctor">Back to doctor area</Link>
        </p>
      </main>
    );
  }
}
