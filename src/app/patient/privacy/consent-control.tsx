'use client';

import { useActionState } from 'react';

import type { ManagedConsentPurpose } from '@/modules/patient';

import {
  recordConsentDecisionAction,
  type ConsentActionState,
} from './actions';

const initialState: ConsentActionState = { message: '', status: 'idle' };

export function ConsentControl({
  currentlyGranted,
  purpose,
}: Readonly<{
  currentlyGranted: boolean;
  purpose: ManagedConsentPurpose;
}>) {
  const [state, action, pending] = useActionState(
    recordConsentDecisionAction,
    initialState,
  );
  const nextStatus = currentlyGranted ? 'withdrawn' : 'granted';
  return (
    <form action={action}>
      <input name="purpose" type="hidden" value={purpose} />
      <input name="status" type="hidden" value={nextStatus} />
      <button disabled={pending} type="submit">
        {pending
          ? 'Recording…'
          : currentlyGranted
            ? 'Revoke for future use'
            : 'Grant consent'}
      </button>
      <p aria-live="polite" role="status">
        {state.message}
      </p>
    </form>
  );
}
