'use client';

import { useActionState } from 'react';

import { EMERGENCY_SCREENING_QUESTIONS } from '@/modules/triage';

import {
  submitEmergencyScreeningAction,
  type IntakeActionState,
} from './actions';

const initialState: IntakeActionState = { message: '', status: 'idle' };

export function EmergencyScreeningForm({
  sessionId,
}: Readonly<{ sessionId: string }>) {
  const [state, formAction, pending] = useActionState(
    submitEmergencyScreeningAction,
    initialState,
  );

  return (
    <section aria-labelledby="emergency-screening-title">
      <h2 id="emergency-screening-title">Check for emergency warning signs</h2>
      <p>
        Answer every question directly. This check cannot rule out an emergency.
        If you believe urgent help is needed, contact local emergency services
        now and do not wait for this app.
      </p>
      <form action={formAction} className="emergency-screening-form">
        <input name="sessionId" type="hidden" value={sessionId} />
        {EMERGENCY_SCREENING_QUESTIONS.map((question) => (
          <fieldset key={question.id}>
            <legend>{question.prompt}</legend>
            {(['yes', 'no', 'unknown'] as const).map((answer) => (
              <label key={answer}>
                <input
                  name={`answer_${question.id}`}
                  required
                  type="radio"
                  value={answer}
                />
                {answer === 'yes'
                  ? 'Yes'
                  : answer === 'no'
                    ? 'No'
                    : 'I am not sure'}
              </label>
            ))}
          </fieldset>
        ))}
        <button disabled={pending} type="submit">
          {pending ? 'Checking…' : 'Complete safety check'}
        </button>
        <p aria-live="polite" className="auth-message" role="status">
          {state.message}
        </p>
      </form>
    </section>
  );
}
