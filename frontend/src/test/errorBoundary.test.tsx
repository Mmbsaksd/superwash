import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { DEFAULT_SETTINGS } from '../services/laundryService';

// Test component that conditionally throws a render exception
const CrashingChild: React.FC<{ shouldCrash: boolean; secretMessage?: string }> = ({
  shouldCrash,
  secretMessage = 'Database connection string postgres://secret_db_pass@supabase'
}) => {
  if (shouldCrash) {
    throw new Error(`CRITICAL_RENDER_FAILURE: ${secretMessage}`);
  }
  return <div data-testid="normal-child">Normal SuperWash Application View</div>;
};

describe('DEF-02: Top-Level React Error Boundary', () => {
  let originalLocation: Location;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress expected React boundary error outputs in test log
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    originalLocation = window.location;
    // Mock window.location.reload
    delete (window as any).location;
    (window as any).location = {
      ...originalLocation,
      reload: vi.fn(),
      href: 'https://superwash.in'
    };
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    (window as any).location = originalLocation;
  });

  it('1. normal application rendering remains unaffected when child renders without errors', () => {
    render(
      <ErrorBoundary>
        <CrashingChild shouldCrash={false} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('normal-child')).toBeInTheDocument();
    expect(screen.getByText('Normal SuperWash Application View')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  it('2. child rendering exception activates the fallback', () => {
    render(
      <ErrorBoundary>
        <CrashingChild shouldCrash={true} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('normal-child')).not.toBeInTheDocument();
  });

  it('3. fallback displays the customer-friendly message ("Something went wrong. Please try again.")', () => {
    render(
      <ErrorBoundary>
        <CrashingChild shouldCrash={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(
      screen.getByText(/We encountered an unexpected issue while loading this page/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reload SuperWash/i })).toBeInTheDocument();
  });

  it('4. reload action invokes the expected browser reload behavior', () => {
    render(
      <ErrorBoundary>
        <CrashingChild shouldCrash={true} />
      </ErrorBoundary>
    );

    const reloadButton = screen.getByRole('button', { name: /Reload SuperWash/i });
    fireEvent.click(reloadButton);

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('5. support link uses the configured business telephone number', () => {
    render(
      <ErrorBoundary>
        <CrashingChild shouldCrash={true} />
      </ErrorBoundary>
    );

    const supportLink = screen.getByTestId('support-phone-link');
    expect(supportLink).toBeInTheDocument();

    const expectedPhone = DEFAULT_SETTINGS.business_phone; // +91 8217541193
    const cleanDigits = expectedPhone.replace(/[^0-9+]/g, '');

    expect(supportLink).toHaveAttribute('href', `tel:${cleanDigits}`);
    expect(supportLink.textContent).toContain(expectedPhone);
  });

  it('6. internal exception details, stack traces, and database secrets are not rendered to customer', () => {
    const sensitiveSecret = 'SECRET_SUPABASE_SERVICE_ROLE_KEY_123456';

    render(
      <ErrorBoundary>
        <CrashingChild shouldCrash={true} secretMessage={sensitiveSecret} />
      </ErrorBoundary>
    );

    // Confirm secret string is completely absent from the rendered DOM
    expect(screen.queryByText(new RegExp(sensitiveSecret, 'i'))).not.toBeInTheDocument();
    expect(screen.queryByText(/CRITICAL_RENDER_FAILURE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/postgres:/i)).not.toBeInTheDocument();

    // Verify safe diagnostic was logged internally
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
