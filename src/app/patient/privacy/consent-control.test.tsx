import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ recordConsentDecisionAction: vi.fn() }));

import { ConsentControl } from './consent-control';

describe('ConsentControl', () => {
  it('submits only a controlled purpose and next decision', () => {
    const { container } = render(
      <ConsentControl currentlyGranted purpose="document_processing" />,
    );
    expect(screen.getByRole('button', { name: /revoke/i })).toBeEnabled();
    expect(
      Array.from(container.querySelectorAll<HTMLInputElement>('input')).map(
        (input) => [input.name, input.value],
      ),
    ).toEqual([
      ['purpose', 'document_processing'],
      ['status', 'withdrawn'],
    ]);
    expect(container.querySelector('[name="policyVersion"]')).toBeNull();
  });
});
