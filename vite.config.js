import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Third argument '' loads every variable, not just VITE_-prefixed ones.
  // Needed because the proxy target below is read by Node during config
  // resolution, so it must NOT use the VITE_ prefix that marks browser-visible
  // variables.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      // Proxy keeps the browser on a single origin in development: the client
      // calls the relative path '/api/chat' and Vite forwards it to Express.
      // That means no CORS preflight on the hot path and no API base URL to
      // configure locally. Override with API_PROXY_TARGET.
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./src/test/setup.js'],
      restoreMocks: true,
      // Scoped to this project's own test roots. Without this, Vitest's default
      // discovery walks the whole tree and picks up test files inside nested git
      // worktrees/agent checkouts (e.g. .kilo/worktrees/*), which are stale
      // copies pinned to older commits and can fail on imports that no longer
      // exist here.
      include: ['src/**/*.{test,spec}.{js,jsx}', 'server/tests/**/*.test.js'],
      exclude: ['**/node_modules/**', '**/dist/**', '.kilo/**'],
    },
  }
})