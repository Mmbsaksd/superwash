import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ResetPasswordPage } from '../pages/public/ResetPasswordPage';
import { LoginPage } from '../pages/public/LoginPage';
import { supabase } from '../services/supabase';

describe('Password Reset Flow & Recovery Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('AuthContext Password Reset Methods', () => {
    it('sends reset email with correct redirect URL pointing to /reset-password', async () => {
      const resetSpy = vi.spyOn(supabase.auth, 'resetPasswordForEmail').mockResolvedValueOnce({
        data: {},
        error: null
      } as any);

      const TestConsumer = () => {
        const { sendPasswordResetEmail } = useAuth();
        const [status, setStatus] = React.useState('');

        return (
          <div>
            <button
              onClick={async () => {
                const res = await sendPasswordResetEmail('staff@superwash.com');
                setStatus(res.message);
              }}
            >
              Send Reset
            </button>
            <div data-testid="status">{status}</div>
          </div>
        );
      };

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      fireEvent.click(screen.getByText('Send Reset'));

      await waitFor(() => {
        expect(resetSpy).toHaveBeenCalledTimes(1);
        expect(resetSpy).toHaveBeenCalledWith('staff@superwash.com', {
          redirectTo: expect.stringMatching(/\/reset-password$/)
        });
      });

      expect(screen.getByTestId('status').textContent).toContain('Password reset instructions sent');
    });

    it('validates password length before calling updateUser in resetPassword', async () => {
      const updateSpy = vi.spyOn(supabase.auth, 'updateUser');

      const TestConsumer = () => {
        const { resetPassword } = useAuth();
        const [error, setError] = React.useState('');

        return (
          <div>
            <button
              onClick={async () => {
                const res = await resetPassword('short');
                if (!res.success) setError(res.message);
              }}
            >
              Update Password
            </button>
            <div data-testid="error">{error}</div>
          </div>
        );
      };

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      fireEvent.click(screen.getByText('Update Password'));

      await waitFor(() => {
        expect(screen.getByTestId('error').textContent).toContain('at least 8 characters');
      });

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('ResetPasswordPage - Callback & Session Handling', () => {
    it('exchanges PKCE recovery code from URL query parameters', async () => {
      const exchangeSpy = vi.spyOn(supabase.auth, 'exchangeCodeForSession').mockResolvedValueOnce({
        data: {
          session: {
            user: { id: 'test-user-id', email: 'manager@superwash.com' },
            access_token: 'valid-test-token'
          }
        },
        error: null
      } as any);

      render(
        <MemoryRouter initialEntries={['/reset-password?code=auth-code-12345']}>
          <AuthProvider>
            <Routes>
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(exchangeSpy).toHaveBeenCalledWith('auth-code-12345');
      });

      // The password reset form should now be visible
      expect(await screen.findByLabelText(/^new password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^confirm new password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save new password/i })).toBeInTheDocument();
    });

    it('verifies token_hash OTP when provided in query parameters', async () => {
      const verifyOtpSpy = vi.spyOn(supabase.auth, 'verifyOtp').mockResolvedValueOnce({
        data: {
          session: {
            user: { id: 'test-user-id', email: 'delivery@superwash.com' },
            access_token: 'otp-token'
          }
        },
        error: null
      } as any);

      render(
        <MemoryRouter initialEntries={['/reset-password?token_hash=token123&type=recovery']}>
          <AuthProvider>
            <Routes>
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(verifyOtpSpy).toHaveBeenCalledWith({
          token_hash: 'token123',
          type: 'recovery'
        });
      });

      expect(await screen.findByLabelText(/^new password/i)).toBeInTheDocument();
    });

    it('handles expired or invalid recovery link and offers resend form', async () => {
      render(
        <MemoryRouter initialEntries={['/reset-password?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired']}>
          <AuthProvider>
            <Routes>
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      expect(await screen.findByText(/this password reset link has expired/i)).toBeInTheDocument();
      expect(screen.getByText(/request a fresh reset link/i)).toBeInTheDocument();

      // Ensure fresh reset email request form can be submitted
      const emailInput = screen.getByPlaceholderText(/manager@superwash\.in/i);
      const resendButton = screen.getByRole('button', { name: /send new reset link/i });

      const resetEmailSpy = vi.spyOn(supabase.auth, 'resetPasswordForEmail').mockResolvedValueOnce({
        data: {},
        error: null
      } as any);

      fireEvent.change(emailInput, { target: { value: 'storemanager@superwash.in' } });
      fireEvent.click(resendButton);

      await waitFor(() => {
        expect(resetEmailSpy).toHaveBeenCalledWith('storemanager@superwash.in', expect.any(Object));
        expect(screen.getByText(/password reset instructions sent/i)).toBeInTheDocument();
      });
    });
  });

  describe('ResetPasswordPage - Password Validation & Form Submission', () => {
    beforeEach(() => {
      // Mock active session so the form is rendered
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: {
          session: {
            user: { id: 'valid-user', email: 'owner@superwash.in' },
            access_token: 'token-abc'
          }
        },
        error: null
      } as any);
    });

    it('validates password length and keeps button disabled when shorter than 8 characters', async () => {
      render(
        <MemoryRouter initialEntries={['/reset-password']}>
          <AuthProvider>
            <Routes>
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      const passInput = await screen.findByLabelText(/^new password/i);
      const confirmInput = screen.getByLabelText(/^confirm new password/i);
      const submitBtn = screen.getByRole('button', { name: /save new password/i });

      fireEvent.change(passInput, { target: { value: 'short1' } });
      fireEvent.change(confirmInput, { target: { value: 'short1' } });

      // Button is disabled when length < 8
      expect(submitBtn).toBeDisabled();
      expect(screen.getByText(/minimum 8 characters \(6\/8\)/i)).toBeInTheDocument();

      // Direct form submit triggers error banner
      const form = screen.getByTestId('reset-password-form');
      fireEvent.submit(form);

      expect(await screen.findByText(/at least 8 characters long/i)).toBeInTheDocument();
    });

    it('rejects passwords without both letters and numbers upon submission', async () => {
      render(
        <MemoryRouter initialEntries={['/reset-password']}>
          <AuthProvider>
            <Routes>
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      const passInput = await screen.findByLabelText(/^new password/i);
      const confirmInput = screen.getByLabelText(/^confirm new password/i);

      // All letters (8+ chars)
      fireEvent.change(passInput, { target: { value: 'onlylettershere' } });
      fireEvent.change(confirmInput, { target: { value: 'onlylettershere' } });

      const form = screen.getByTestId('reset-password-form');
      fireEvent.submit(form);

      expect(await screen.findByText(/at least one letter and one number/i)).toBeInTheDocument();
    });

    it('shows mismatch feedback and keeps submit disabled when passwords differ', async () => {
      render(
        <MemoryRouter initialEntries={['/reset-password']}>
          <AuthProvider>
            <Routes>
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      const passInput = await screen.findByLabelText(/^new password/i);
      const confirmInput = screen.getByLabelText(/^confirm new password/i);
      const submitBtn = screen.getByRole('button', { name: /save new password/i });

      fireEvent.change(passInput, { target: { value: 'SecurePass123' } });
      fireEvent.change(confirmInput, { target: { value: 'DifferentPass123' } });

      expect(submitBtn).toBeDisabled();
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();

      const form = screen.getByTestId('reset-password-form');
      fireEvent.submit(form);

      expect(await screen.findByText(/new password and confirm password do not match/i)).toBeInTheDocument();
    });

    it('successfully updates password via supabase.auth.updateUser', async () => {
      const updateSpy = vi.spyOn(supabase.auth, 'updateUser').mockResolvedValueOnce({
        data: {
          user: { id: 'valid-user', email: 'owner@superwash.in' }
        },
        error: null
      } as any);

      render(
        <MemoryRouter initialEntries={['/reset-password']}>
          <AuthProvider>
            <Routes>
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      const passInput = await screen.findByLabelText(/^new password/i);
      const confirmInput = screen.getByLabelText(/^confirm new password/i);
      const submitBtn = screen.getByRole('button', { name: /save new password/i });

      fireEvent.change(passInput, { target: { value: 'NewCleanPassword123!' } });
      fireEvent.change(confirmInput, { target: { value: 'NewCleanPassword123!' } });

      expect(submitBtn).not.toBeDisabled();
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith({
          password: 'NewCleanPassword123!'
        });
      });

      expect(await screen.findByText(/password has been successfully reset/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in with new password/i })).toBeInTheDocument();
    });
  });

  describe('LoginPage Recovery Forwarding', () => {
    it('forwards recovery links that land on /login directly to /reset-password', async () => {
      render(
        <MemoryRouter initialEntries={['/login?code=recovery-code-123']}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<div data-testid="reset-page">Reset Password Destination</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      expect(await screen.findByTestId('reset-page')).toBeInTheDocument();
    });
  });
});
