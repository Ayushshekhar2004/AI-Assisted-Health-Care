import { logoutAction } from '@/app/auth/actions';

export default function DoctorHomePage() {
  return (
    <main>
      <h1>Doctor area</h1>
      <p>Your protected clinician workspace is ready.</p>
      <form action={logoutAction}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
