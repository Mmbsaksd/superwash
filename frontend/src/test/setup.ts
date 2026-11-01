import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { setLiveModeForTesting } from '../services/laundryService';

// Ensure unit tests run in local isolated mode and do not attempt network queries
// to unmigrated remote Supabase databases
import.meta.env.VITE_DEMO_MODE = 'true';

afterEach(() => {
  setLiveModeForTesting(false);
});

// Polyfill window.matchMedia for JSDOM test runner
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
