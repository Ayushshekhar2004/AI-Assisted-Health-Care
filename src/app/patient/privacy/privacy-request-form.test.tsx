import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({
  submitPrivacyRequestAction: vi.fn(),
}));

import { PrivacyRequestForm } from './privacy-request-form';

describe('PrivacyRequestForm', () => {
  it('offers reviewed workflows without claiming medical records will be deleted', () => {
    const { container } = render(<PrivacyRequestForm />);
    expect(screen.getByText('Export my data')).toBeInTheDocument();
    expect(
      screen.getByText('Request account deactivation or deletion review'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/will not be automatically deleted/i),
    ).toBeInTheDocument();
    expect(container.querySelector('[name="patientId"]')).toBeNull();
    expect(container.querySelector('[name="status"]')).toBeNull();
  });
});
