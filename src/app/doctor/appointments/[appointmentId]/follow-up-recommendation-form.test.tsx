import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./follow-up-actions', () => ({
  createFollowUpRecommendationAction: vi.fn(),
}));

import { FollowUpRecommendationForm } from './follow-up-recommendation-form';

describe('FollowUpRecommendationForm', () => {
  it('is available only for a finalized follow-up-required outcome', () => {
    const { rerender } = render(
      <FollowUpRecommendationForm
        appointmentId="81000000-0000-4000-8000-000000000001"
        outcome="TELECONSULT_COMPLETED"
        recommendation={null}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    rerender(
      <FollowUpRecommendationForm
        appointmentId="81000000-0000-4000-8000-000000000001"
        outcome="FOLLOW_UP_REQUIRED"
        recommendation={null}
      />,
    );
    expect(
      screen.getByRole('button', { name: /create follow-up/i }),
    ).toBeEnabled();
    expect(
      screen.getByText(/does not copy.*intake.*prescription/i),
    ).toBeInTheDocument();
  });
});
