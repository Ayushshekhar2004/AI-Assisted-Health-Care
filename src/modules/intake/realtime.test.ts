import { describe, expect, it } from 'vitest';

import {
  assessVoiceTranscript,
  buildRealtimeTranscriptionSession,
  isTrustedRealtimeSessionRequest,
  parseRealtimeSessionRequest,
  realtimeClientSecretResponseSchema,
  realtimeTranscriptionCompletedEventSchema,
} from './realtime';

const sessionId = '71000000-0000-4000-8000-000000000001';

describe('intake realtime boundaries', () => {
  it.each(['en', 'hi'])(
    'accepts the supported %s voice language',
    (language) => {
      expect(parseRealtimeSessionRequest({ sessionId, language })).toEqual({
        sessionId,
        language,
      });
    },
  );

  it('rejects extra identity fields and unsupported languages', () => {
    expect(() =>
      parseRealtimeSessionRequest({ sessionId, language: 'fr' }),
    ).toThrow();
    expect(() =>
      parseRealtimeSessionRequest({
        sessionId,
        language: 'en',
        patientId: sessionId,
      }),
    ).toThrow();
  });

  it('validates only the short-lived browser credential response shape', () => {
    expect(
      realtimeClientSecretResponseSchema.parse({
        value: 'ek_synthetic_short_lived',
        expiresAt: 1788123456,
      }),
    ).toEqual({ value: 'ek_synthetic_short_lived', expiresAt: 1788123456 });
    expect(() =>
      realtimeClientSecretResponseSchema.parse({
        value: 'short',
        expiresAt: 0,
      }),
    ).toThrow();
  });

  it('accepts completed transcripts but rejects unrelated realtime events', () => {
    expect(
      realtimeTranscriptionCompletedEventSchema.parse({
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'synthetic-item',
        transcript: 'Synthetic spoken response.',
      }).transcript,
    ).toBe('Synthetic spoken response.');
    expect(() =>
      realtimeTranscriptionCompletedEventSchema.parse({
        type: 'response.output_audio.delta',
        item_id: 'synthetic-item',
        transcript: 'Not patient input',
      }),
    ).toThrow();
  });

  it('validates transcription log probabilities when present', () => {
    expect(
      realtimeTranscriptionCompletedEventSchema.parse({
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'synthetic-item',
        transcript: 'Synthetic spoken response.',
        logprobs: [{ token: 'Synthetic', logprob: -0.1 }],
      }).logprobs,
    ).toEqual([{ token: 'Synthetic', logprob: -0.1 }]);
    expect(() =>
      realtimeTranscriptionCompletedEventSchema.parse({
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'synthetic-item',
        transcript: 'Synthetic spoken response.',
        logprobs: [{ token: 'Synthetic', logprob: 'high' }],
      }),
    ).toThrow();
  });

  it.each([
    ['medicine', 'I take medicine every morning.'],
    ['allergy', 'I am allergic to a synthetic test substance.'],
    ['duration', 'This has lasted for three days.'],
    ['dosage', 'The label says 10 mg.'],
    ['age', 'I am 35 years old.'],
    ['pregnancy', 'Pregnancy is possible.'],
    ['medicine', 'मैं रोज दवा लेता हूं।'],
    ['allergy', 'मुझे एलर्जी है।'],
    ['duration', 'यह तीन दिन से है।'],
    ['dosage', 'दिन में दो बार।'],
    ['age', 'मेरी उम्र 35 है।'],
    ['pregnancy', 'मैं गर्भवती हो सकती हूं।'],
  ] as const)(
    'detects medically important %s transcript content',
    (entity, text) => {
      expect(
        assessVoiceTranscript(text, [{ logprob: -0.1 }]).entities,
      ).toContain(entity);
    },
  );

  it('treats missing or weak recognition data as uncertain', () => {
    expect(assessVoiceTranscript('Synthetic response.', undefined)).toEqual({
      entities: [],
      recognitionUncertain: true,
    });
    expect(
      assessVoiceTranscript('Synthetic response.', [
        { logprob: -0.1 },
        { logprob: -1.1 },
      ]).recognitionUncertain,
    ).toBe(true);
    expect(
      assessVoiceTranscript('Synthetic response.', [{ logprob: -0.1 }])
        .recognitionUncertain,
    ).toBe(false);
  });

  it('builds transcription-only sessions with language guidance and no assistant output', () => {
    const session = buildRealtimeTranscriptionSession(
      'hi',
      'synthetic-transcribe-model',
    );
    expect(session).toMatchObject({
      type: 'transcription',
      include: ['item.input_audio_transcription.logprobs'],
      audio: {
        input: {
          transcription: {
            model: 'synthetic-transcribe-model',
            languages: ['hi'],
          },
          turn_detection: { create_response: false },
        },
      },
    });
    expect(session).not.toHaveProperty('instructions');
    expect(session).not.toHaveProperty('audio.output');
  });

  it('accepts only same-origin JSON token requests', () => {
    expect(
      isTrustedRealtimeSessionRequest(
        'https://synthetic-app.invalid',
        'https://synthetic-app.invalid',
        'application/json; charset=utf-8',
      ),
    ).toBe(true);
    expect(
      isTrustedRealtimeSessionRequest(
        'https://cross-site.invalid',
        'https://synthetic-app.invalid',
        'application/json',
      ),
    ).toBe(false);
    expect(
      isTrustedRealtimeSessionRequest(
        'https://synthetic-app.invalid',
        'https://synthetic-app.invalid',
        'text/plain',
      ),
    ).toBe(false);
  });
});
