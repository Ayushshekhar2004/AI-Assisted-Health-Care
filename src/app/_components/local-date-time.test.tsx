import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LocalDateTime } from './local-date-time';

describe('LocalDateTime', () => {
  it('formats the UTC slot in the runtime device timezone', async () => {
    const { container } = render(
      <LocalDateTime
        endsAt="2026-08-31T10:30:00.000Z"
        startsAt="2026-08-31T10:00:00.000Z"
      />,
    );

    const time = container.querySelector('time');
    expect(time).not.toBeNull();
    if (!time) throw new Error('Expected a time element');
    expect(time).toHaveAttribute('datetime', '2026-08-31T10:00:00.000Z');
    await waitFor(() =>
      expect(time).toHaveTextContent(
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    );
  });
});
