'use client';

import { useActionState } from 'react';
import {
  uploadDocumentAction,
  type DocumentUploadActionState,
} from './actions';

const initialState: DocumentUploadActionState = { message: '', status: 'idle' };

export function DocumentUploadForm({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const [state, action, pending] = useActionState(
    uploadDocumentAction,
    initialState,
  );
  return (
    <form action={action} className="document-upload-form">
      <input name="appointmentId" type="hidden" value={appointmentId} />
      <label>
        Add a private report or image
        <input
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
          name="document"
          required
          type="file"
        />
      </label>
      <p>PDF, JPEG, PNG, or WebP. Maximum 10 MB.</p>
      <button disabled={pending} type="submit">
        {pending ? 'Uploading…' : 'Upload privately'}
      </button>
      {state.message ? <p role="status">{state.message}</p> : null}
    </form>
  );
}
