import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TranscriptMessages, TranscriptPanel } from './transcript-panel';

vi.mock('../../../_components/local-date-time', () => ({
  LocalDateTime: ({ startsAt }: { startsAt: string }) => (
    <time>{startsAt}</time>
  ),
}));
vi.mock('./transcript-actions', () => ({
  expandAppointmentTranscriptAction: vi.fn(),
}));

describe('TranscriptPanel', () => {
  it('does not render transcript content before the explicit expand action', () => {
    render(
      <TranscriptPanel appointmentId="91000000-0000-4000-8000-000000000001" />,
    );

    expect(
      screen.getByRole('button', { name: 'Expand transcript' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByText('Synthetic hidden transcript.'),
    ).not.toBeInTheDocument();
  });

  it('marks assistant transcript content as AI-generated and unverified', () => {
    render(
      <TranscriptMessages
        messages={[
          {
            id: '92000000-0000-4000-8000-000000000001',
            role: 'patient',
            text: 'Synthetic patient transcript.',
            createdAt: '2026-09-01T08:00:00.000Z',
          },
          {
            id: '92000000-0000-4000-8000-000000000002',
            role: 'assistant',
            text: 'Synthetic assistant transcript.',
            createdAt: '2026-09-01T08:01:00.000Z',
          },
        ]}
      />,
    );

    expect(screen.getByText('Patient-provided')).toBeInTheDocument();
    expect(
      screen.getByText(/AI intake assistant — unverified/i),
    ).toBeInTheDocument();
  });
});
