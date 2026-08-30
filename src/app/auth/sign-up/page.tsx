import { signUpAction } from '../actions';
import { AuthForm } from '../auth-form';

export default function SignUpPage() {
  return (
    <main className="auth-card">
      <h1>Create a patient account</h1>
      <p>
        Development registration uses email. Use synthetic information in
        non-production systems.
      </p>
      <AuthForm action={signUpAction} mode="sign-up" />
    </main>
  );
}
