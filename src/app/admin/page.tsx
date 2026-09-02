import { logoutAction } from '@/app/auth/actions';
import Link from 'next/link';

export default function AdminHomePage() {
  return (
    <main>
      <h1>Operations area</h1>
      <p>
        Administrative actions run through authorized server-only workflows.
      </p>
      <p>
        <Link href="/admin/doctors">Review doctor verification queue</Link>
      </p>
      <p>
        <Link href="/admin/audit">Read-only audit lookup</Link>
      </p>
      <form action={logoutAction}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
