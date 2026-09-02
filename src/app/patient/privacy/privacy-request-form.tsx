'use client';

import { useActionState } from 'react';

import { privacyRequestTypeLabels } from '../../../modules/patient';

import { submitPrivacyRequestAction, type ConsentActionState } from './actions';

const initialState: ConsentActionState = { message: '', status: 'idle' };

export function PrivacyRequestForm() {
  const [state, action, pending] = useActionState(
    submitPrivacyRequestAction,
    initialState,
  );
  return (
    <form action={action} className="auth-form">
      <label>
        Request type
        <select name="requestType" required>
          {Object.entries(privacyRequestTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Details for the reviewer
        <textarea maxLength={2000} minLength={1} name="details" required />
      </label>
      <p>
        Account deletion requests are reviewed. Finalized medical records and
        other protected records will not be automatically deleted while legal
        and clinical retention requirements remain unresolved.
      </p>
      <button disabled={pending} type="submit">
        {pending ? 'Submitting…' : 'Submit privacy request'}
      </button>
      <p aria-live="polite" role="status">
        {state.message}
      </p>
    </form>
  );
}
