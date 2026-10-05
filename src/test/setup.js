import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only auto-registers this when a global `afterEach` exists
// (i.e. Vitest `globals: true`). This project imports `describe`/`it` explicitly,
// so unmount between tests has to be wired up deliberately. Without it, each
// render() leaks into the next test and queries match multiple elements.
afterEach(() => {
  cleanup();
});