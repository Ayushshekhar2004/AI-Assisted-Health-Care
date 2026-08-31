'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

import {
  assessVoiceTranscript,
  intakeVoiceLanguageSchema,
  realtimeClientSecretResponseSchema,
  realtimeTranscriptionCompletedEventSchema,
  type IntakeVoiceLanguage,
  type TranscriptConfirmationAssessment,
} from '../../../modules/intake';

type VoiceStatus =
  | 'idle'
  | 'requesting_permission'
  | 'connecting'
  | 'listening'
  | 'transcribing'
  | 'error';

const STATUS_MESSAGES: Readonly<Record<VoiceStatus, string>> = {
  idle: 'Voice input is off. You can type at any time.',
  requesting_permission: 'Waiting for microphone permission…',
  connecting: 'Connecting secure voice transcription…',
  listening: 'Microphone is on. Speak your response, then stop the microphone.',
  transcribing: 'Microphone is off. Finishing the transcript…',
  error: 'Voice input is unavailable. You can continue with text.',
};

type VoiceInputProps = Readonly<{
  disabled: boolean;
  sessionId: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}>;

type PendingTranscript = Readonly<{
  assessment: TranscriptConfirmationAssessment;
  text: string;
}>;

const ENTITY_LABELS = {
  medicine: 'medicine name',
  allergy: 'allergy',
  duration: 'duration',
  dosage: 'dosage',
  age: 'age',
  pregnancy: 'pregnancy-related answer',
} as const;

type TranscriptConfirmationProps = Readonly<{
  disabled: boolean;
  pendingTranscript: PendingTranscript;
  onChange: (text: string) => void;
  onConfirm: () => void;
  onDiscard: () => void;
}>;

export function TranscriptConfirmation({
  disabled,
  pendingTranscript,
  onChange,
  onConfirm,
  onDiscard,
}: TranscriptConfirmationProps) {
  return (
    <div className="transcript-confirmation" role="group">
      <h4>Confirm the spoken text before it is used</h4>
      {pendingTranscript.assessment.recognitionUncertain ? (
        <p role="alert">
          Speech recognition may be uncertain. Correct any words that do not
          match what you said.
        </p>
      ) : null}
      {pendingTranscript.assessment.entities.length ? (
        <p>
          Please check medically important details carefully:{' '}
          {pendingTranscript.assessment.entities
            .map((entity) => ENTITY_LABELS[entity])
            .join(', ')}
          .
        </p>
      ) : (
        <p>
          Spoken health information must be confirmed before it can be added to
          your response.
        </p>
      )}
      <label>
        Recognized text
        <textarea
          maxLength={4000}
          onChange={(event) => onChange(event.currentTarget.value)}
          rows={4}
          value={pendingTranscript.text}
        />
      </label>
      <div className="voice-input-actions">
        <button
          disabled={disabled || !pendingTranscript.text.trim()}
          onClick={onConfirm}
          type="button"
        >
          Confirm and use text
        </button>
        <button disabled={disabled} onClick={onDiscard} type="button">
          Discard transcript
        </button>
      </div>
    </div>
  );
}

export function VoiceInput({
  disabled,
  sessionId,
  textareaRef,
}: VoiceInputProps) {
  const [language, setLanguage] = useState<IntakeVoiceLanguage>('en');
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [pendingTranscript, setPendingTranscript] =
    useState<PendingTranscript | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptItemsRef = useRef(new Set<string>());

  const closeConnection = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
  }, []);

  const switchToText = useCallback(() => {
    closeConnection();
    setStatus('idle');
    textareaRef.current?.focus();
  }, [closeConnection, textareaRef]);

  useEffect(() => closeConnection, [closeConnection]);
  useEffect(() => {
    if (disabled) switchToText();
  }, [disabled, switchToText]);

  async function startVoice() {
    if (status !== 'idle' && status !== 'error') return;
    closeConnection();
    setPendingTranscript(null);
    transcriptItemsRef.current.clear();

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      setStatus('error');
      return;
    }

    try {
      setStatus('requesting_permission');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      setStatus('connecting');

      const tokenResponse = await fetch('/api/intake/realtime-session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, language }),
      });
      if (!tokenResponse.ok) throw new Error('Voice session unavailable');
      const clientSecret = realtimeClientSecretResponseSchema.parse(
        await tokenResponse.json(),
      );

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      const channel = peer.createDataChannel('oai-events');
      channelRef.current = channel;
      stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));

      channel.addEventListener('open', () => setStatus('listening'));
      channel.addEventListener('message', (message) => {
        let event: unknown;
        try {
          event = JSON.parse(String(message.data));
        } catch {
          return;
        }
        const completed =
          realtimeTranscriptionCompletedEventSchema.safeParse(event);
        if (
          !completed.success ||
          transcriptItemsRef.current.has(completed.data.item_id)
        )
          return;
        transcriptItemsRef.current.add(completed.data.item_id);
        const assessment = assessVoiceTranscript(
          completed.data.transcript,
          completed.data.logprobs,
        );
        setPendingTranscript((current) => ({
          assessment: {
            entities: Array.from(
              new Set([
                ...(current?.assessment.entities ?? []),
                ...assessment.entities,
              ]),
            ),
            recognitionUncertain:
              (current?.assessment.recognitionUncertain ?? false) ||
              assessment.recognitionUncertain,
          },
          text: [current?.text.trim(), completed.data.transcript]
            .filter(Boolean)
            .join(' ')
            .slice(0, 4000),
        }));
        if (streamRef.current === null) switchToText();
      });
      channel.addEventListener('error', () => {
        closeConnection();
        setStatus('error');
      });

      const offer = await peer.createOffer();
      if (!offer.sdp) throw new Error('Voice connection unavailable');
      await peer.setLocalDescription(offer);
      const callResponse = await fetch(
        'https://api.openai.com/v1/realtime/calls',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${clientSecret.value}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
        },
      );
      if (!callResponse.ok) throw new Error('Voice connection unavailable');
      await peer.setRemoteDescription({
        type: 'answer',
        sdp: await callResponse.text(),
      });
    } catch (error) {
      closeConnection();
      setStatus('error');
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        textareaRef.current?.focus();
      }
    }
  }

  function stopMicrophone() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStatus('transcribing');
    closeTimerRef.current = setTimeout(switchToText, 3000);
  }

  const voiceActive = !['idle', 'error'].includes(status);

  function confirmTranscript() {
    if (!pendingTranscript) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.value = [textarea.value.trim(), pendingTranscript.text.trim()]
      .filter(Boolean)
      .join(' ')
      .slice(0, 4000);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    setPendingTranscript(null);
    textarea.focus();
  }

  return (
    <section aria-labelledby="voice-input-heading" className="voice-input">
      <h3 id="voice-input-heading">Optional voice input</h3>
      <p>
        When you enable the microphone, audio is sent directly to OpenAI for
        live transcription. This app does not save an audio recording. Review
        and edit the transcript before sending it.
      </p>
      <label>
        Spoken language
        <select
          disabled={disabled || voiceActive}
          onChange={(event) =>
            setLanguage(
              intakeVoiceLanguageSchema.parse(event.currentTarget.value),
            )
          }
          value={language}
        >
          <option value="en">English</option>
          <option value="hi">Hindi</option>
        </select>
      </label>
      <div className="voice-input-actions">
        {!voiceActive ? (
          <button disabled={disabled} onClick={startVoice} type="button">
            Enable microphone
          </button>
        ) : status === 'listening' ? (
          <button disabled={disabled} onClick={stopMicrophone} type="button">
            Stop microphone
          </button>
        ) : null}
        <button disabled={disabled} onClick={switchToText} type="button">
          Use text instead
        </button>
      </div>
      <p aria-live="polite" className="auth-message" role="status">
        {STATUS_MESSAGES[status]}
      </p>
      {pendingTranscript ? (
        <TranscriptConfirmation
          disabled={disabled}
          onChange={(text) =>
            setPendingTranscript((current) =>
              current ? { ...current, text } : null,
            )
          }
          onConfirm={confirmTranscript}
          onDiscard={() => setPendingTranscript(null)}
          pendingTranscript={pendingTranscript}
        />
      ) : null}
    </section>
  );
}
