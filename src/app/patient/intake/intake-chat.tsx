'use client';

import { useActionState, useEffect, useRef } from 'react';

import { LocalDateTime } from '@/app/_components/local-date-time';
import type { IntakeMessage } from '@/modules/intake/server';

import { sendIntakeMessageAction, type IntakeActionState } from './actions';
import { VoiceInput } from './voice-input';

const initialState: IntakeActionState = { message: '', status: 'idle' };

export function IntakeChat({
  messages,
  sessionId,
}: Readonly<{ messages: IntakeMessage[]; sessionId: string }>) {
  const [state, formAction, pending] = useActionState(
    sendIntakeMessageAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.status === 'success') formRef.current?.reset();
  }, [state]);

  return (
    <>
      <ol aria-label="Intake conversation" className="intake-messages">
        {messages.map((message) => (
          <li
            className={`intake-message intake-message-${message.role}`}
            key={message.id}
          >
            <p className="intake-message-role">
              {message.role === 'patient' ? 'You' : 'Intake assistant'}
            </p>
            <p>{message.text}</p>
            <small>
              <LocalDateTime startsAt={message.createdAt} />
            </small>
          </li>
        ))}
      </ol>

      <form action={formAction} className="auth-form" ref={formRef}>
        <input name="sessionId" type="hidden" value={sessionId} />
        <label>
          Your response
          <textarea
            maxLength={4000}
            name="message"
            ref={textareaRef}
            required
            rows={5}
          />
        </label>
        <VoiceInput
          disabled={pending}
          sessionId={sessionId}
          textareaRef={textareaRef}
        />
        <button disabled={pending} type="submit">
          {pending ? 'Sending…' : 'Send response'}
        </button>
        <p aria-live="polite" className="auth-message" role="status">
          {state.message}
        </p>
      </form>
    </>
  );
}
