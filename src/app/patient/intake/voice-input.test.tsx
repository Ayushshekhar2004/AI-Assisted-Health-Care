import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TranscriptConfirmation, VoiceInput } from './voice-input';

const originalMediaDevices = navigator.mediaDevices;
const originalPeerConnection = globalThis.RTCPeerConnection;

afterEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: originalMediaDevices,
  });
  globalThis.RTCPeerConnection = originalPeerConnection;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderVoiceInput() {
  const textareaRef = createRef<HTMLTextAreaElement>();
  render(
    <>
      <textarea aria-label="Your response" ref={textareaRef} />
      <VoiceInput
        disabled={false}
        sessionId="71000000-0000-4000-8000-000000000001"
        textareaRef={textareaRef}
      />
    </>,
  );
}

describe('VoiceInput', () => {
  it('shows optional permission disclosure, both languages, and text fallback', () => {
    renderVoiceInput();

    expect(
      screen.getByText(/audio is sent directly to OpenAI/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hindi' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Enable microphone' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use text instead' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/voice input is off/i)).toBeInTheDocument();
  });

  it('requests microphone permission only after the explicit enable action', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(
        new DOMException('Synthetic permission denial', 'NotAllowedError'),
      );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    globalThis.RTCPeerConnection = class {} as typeof RTCPeerConnection;
    renderVoiceInput();

    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enable microphone' }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    expect(screen.getByText(/voice input is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /microphone permission was denied/i,
    );
    expect(screen.getByLabelText('Your response')).toHaveFocus();
  });

  it('stops captured media and offers text recovery during provider outage', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop }],
      getAudioTracks: () => [],
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    globalThis.RTCPeerConnection = class {} as typeof RTCPeerConnection;
    let resolveToken!: (value: { ok: boolean }) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveToken = resolve;
          }),
      ),
    );
    renderVoiceInput();

    fireEvent.click(screen.getByRole('button', { name: 'Enable microphone' }));

    expect(
      await screen.findByText(/connecting secure voice/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use text instead' }),
    ).toBeEnabled();
    resolveToken({ ok: false });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /voice service is unavailable/i,
    );
    expect(stop).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', { name: 'Enable microphone' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Use text instead' }),
    ).toBeEnabled();
  });

  it('cleans up microphone tracks when the tab is refreshed or component unmounts', async () => {
    const stop = vi.fn();
    let resolveToken!: (value: Response) => void;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop }],
          getAudioTracks: () => [],
        }),
      },
    });
    globalThis.RTCPeerConnection = class {} as typeof RTCPeerConnection;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveToken = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const textareaRef = createRef<HTMLTextAreaElement>();
    const view = render(
      <>
        <textarea aria-label="Your response" ref={textareaRef} />
        <VoiceInput
          disabled={false}
          sessionId="71000000-0000-4000-8000-000000000001"
          textareaRef={textareaRef}
        />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enable microphone' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    view.unmount();
    expect(stop).toHaveBeenCalledOnce();
    resolveToken(new Response(null, { status: 503 }));
  });
});

describe('TranscriptConfirmation', () => {
  it('requires an uncertain transcript to be corrected and confirmed', () => {
    const onChange = vi.fn();
    const onConfirm = vi.fn();
    const onDiscard = vi.fn();
    render(
      <TranscriptConfirmation
        disabled={false}
        onChange={onChange}
        onConfirm={onConfirm}
        onDiscard={onDiscard}
        pendingTranscript={{
          assessment: {
            entities: [
              'medicine',
              'allergy',
              'duration',
              'dosage',
              'age',
              'pregnancy',
            ],
            recognitionUncertain: true,
          },
          text: 'Synthetic recognized health information.',
        }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      /speech recognition may be uncertain/i,
    );
    expect(
      screen.getByText(
        /medicine name, allergy, duration, dosage, age, pregnancy-related answer/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Recognized text')).toHaveValue(
      'Synthetic recognized health information.',
    );
    fireEvent.change(screen.getByLabelText('Recognized text'), {
      target: { value: 'Corrected synthetic information.' },
    });
    expect(onChange).toHaveBeenCalledWith('Corrected synthetic information.');
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm and use text' }),
    );
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Discard transcript' }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('still requires confirmation when no important category is detected', () => {
    render(
      <TranscriptConfirmation
        disabled={false}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
        onDiscard={vi.fn()}
        pendingTranscript={{
          assessment: { entities: [], recognitionUncertain: false },
          text: 'Synthetic general response.',
        }}
      />,
    );

    expect(
      screen.getByText(/spoken health information must be confirmed/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
