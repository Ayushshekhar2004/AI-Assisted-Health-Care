'use client';

import { useActionState } from 'react';

import {
  transitionPrivacyRequestAction,
  type PrivacyReviewActionState,
} from './actions';

const initialState: PrivacyReviewActionState = { message: '', status: 'idle' };

export function PrivacyRequestReviewForm({
  requestId,
  status,
}: Readonly<{ requestId: string; status: string }>) {
  const [state, action, pending] = useActionState(
    transitionPrivacyRequestAction,
    initialState,
  );
  if (status === 'RESOLVED' || status === 'DECLINED') return null;
  return (
    <form action={action} className="auth-form">
      <input name="requestId" type="hidden" value={requestId} />
      {status === 'QUEUED' ? (
        <>
          <input name="nextStatus" type="hidden" value="UNDER_REVIEW" />
          <input name="resolutionCategory" type="hidden" value="" />
          <button disabled={pending} type="submit">
            Begin review
          </button>
        </>
      ) : (
        <>
          <label>
            Reviewed outcome
            <select name="resolutionCategory" required>
              <option value="EXPORT_PROVIDED">Export provided</option>
              <option value="CORRECTION_WORKFLOW_STARTED">
                Correction workflow started
              </option>
              <option value="ACCOUNT_DEACTIVATION_REVIEWED">
                Account deactivation reviewed
              </option>
              <option value="GRIEVANCE_RESPONDED">Grievance responded</option>
              <option value="REQUEST_NOT_ACTIONABLE">
                Request not actionable
              </option>
            </select>
          </label>
          <button
            disabled={pending}
            name="nextStatus"
            type="submit"
            value="RESOLVED"
          >
            Mark resolved
          </button>{' '}
          <button
            disabled={pending}
            name="nextStatus"
            type="submit"
            value="DECLINED"
          >
            Decline request
          </button>
        </>
      )}
      <p aria-live="polite" role="status">
        {state.message}
      </p>
    </form>
  );
}
