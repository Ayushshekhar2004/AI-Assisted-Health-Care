'use client';

import { useActionState } from 'react';

import { verifyDoctorAction, type VerificationActionState } from './actions';

const initialState: VerificationActionState = { message: '', status: 'idle' };

export function VerificationForm({ doctorId }: Readonly<{ doctorId: string }>) {
  const [state, formAction, pending] = useActionState(
    verifyDoctorAction,
    initialState,
  );

  return (
    <form action={formAction} className="auth-form">
      <input name="doctorId" type="hidden" value={doctorId} />
      <label>
        Decision reason
        <textarea maxLength={500} minLength={5} name="reason" required />
      </label>
      <div>
        <button
          disabled={pending}
          name="decision"
          type="submit"
          value="approved"
        >
          Approve
        </button>{' '}
        <button
          disabled={pending}
          name="decision"
          type="submit"
          value="rejected"
        >
          Reject
        </button>
      </div>
      <p aria-live="polite" className="auth-message" role="status">
        {state.message}
      </p>
    </form>
  );
}
