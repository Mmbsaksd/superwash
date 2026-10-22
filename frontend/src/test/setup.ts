import '@testing-library/jest-dom';

// Ensure unit tests run in local isolated mode and do not attempt network queries
// to unmigrated remote Supabase databases
import.meta.env.VITE_DEMO_MODE = 'true';
