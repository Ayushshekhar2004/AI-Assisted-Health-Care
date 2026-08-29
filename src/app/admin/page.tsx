import { logoutAction } from '@/app/auth/actions';

export default function AdminHomePage() {
  return (
    <main>
      <h1>Operations area</h1>
      <p>Administrative actions remain server-only and are not implemented yet.</p>
      <form action={logoutAction}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
