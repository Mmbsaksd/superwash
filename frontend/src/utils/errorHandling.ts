/**
 * Customer-Facing Error Sanitization and Diagnostics
 *
 * Prevents raw technical database, network, authentication, and internal API
 * error strings from leaking to end customers while providing safe diagnostic
 * logging and clear, actionable retry guidance.
 */

export function formatCustomerError(
  err: unknown,
  fallbackMessage = 'Unable to complete your request. Please try again.'
): string {
  if (!err) return fallbackMessage;

  const rawMessage = typeof err === 'string'
    ? err
    : (err as any)?.message || (err as any)?.error_description || String(err);

  // Safe internal diagnostic log - avoids printing tokens, passwords, or PII
  if (process.env.NODE_ENV !== 'test') {
    const sanitizedDiagnostic = rawMessage.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
    console.error('[SuperWash Diagnostic Error]:', sanitizedDiagnostic);
  }

  const lower = rawMessage.toLowerCase();

  // 1. User-correctable validation messages intentionally emitted by business logic
  if (
    lower.includes('pin code') ||
    lower.includes('pickup slot') ||
    lower.includes('coverage') ||
    lower.includes('service is currently deactivated') ||
    lower.includes('please select') ||
    lower.includes('please enter') ||
    lower.includes('valid 10-digit') ||
    lower.includes('minimum billable weight') ||
    lower.includes('fully booked')
  ) {
    return rawMessage;
  }

  // 2. Gateway, API key, or 5xx server errors
  if (
    lower.includes('api key') ||
    lower.includes('apikey') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504')
  ) {
    return 'Our booking service is temporarily busy. Please wait a moment and retry.';
  }

  // 3. Authentication, sign-in required, and expired session handling
  if (
    lower.includes('sign-in required') ||
    lower.includes('sign in required') ||
    lower.includes('not authenticated') ||
    lower.includes('unauthenticated') ||
    lower.includes('login required')
  ) {
    return 'Sign-in required: Please sign in with your account to confirm your pickup booking.';
  }

  if (
    lower.includes('jwt') ||
    lower.includes('token') ||
    lower.includes('session') ||
    lower.includes('unauthorized') ||
    lower.includes('401')
  ) {
    return 'Your sign-in session has expired. Please refresh the page or sign in again to continue.';
  }

  // 5. Network and connectivity failures
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('offline') ||
    lower.includes('econnrefused') ||
    lower.includes('abort') ||
    lower.includes('timeout')
  ) {
    return 'Unable to reach our server. Please check your internet connection and try again.';
  }

  // 6. Database or PostgREST internal errors
  if (
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('rls') ||
    lower.includes('pgrst') ||
    lower.includes('relation') ||
    lower.includes('syntax') ||
    lower.includes('column') ||
    lower.includes('foreign key') ||
    lower.includes('violates')
  ) {
    return 'A temporary service issue occurred while processing your request. Please try again in a few moments.';
  }

  return fallbackMessage;
}
