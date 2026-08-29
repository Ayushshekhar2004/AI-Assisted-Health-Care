import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>AI-Assisted Health Care</h1>
      <p>Application foundation is ready. Healthcare features are not yet enabled.</p>
      <p>
        <Link href="/auth/login">Sign in</Link>
      </p>
    </main>
  );
}
