import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Only the production build is served from /app/dist via the Vercel rewrite;
  // the dev server serves from its own root, so base must stay default there.
  base: command === 'build' ? '/app/dist/' : '/',
  build: {
    rollupOptions: {
      output: {
        // TWM-219: a stable vendor chunk so the framework code is cached
        // across app deploys. Route code lands in its own lazy chunk (see
        // App.jsx's React.lazy imports). rolldown (Vite 8) wants the
        // function form of manualChunks.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|@tanstack\/react-query|@tanstack\/query-core)\//.test(id)) {
            return 'vendor';
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    globals: true,
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Baseline measured on the existing suite (statements 87.38%,
      // branches 77.45%, functions 85.25%, lines 90.61%) — set a few
      // points below so CI fails on a real regression, not on noise from
      // adding one small uncovered branch. Raise these deliberately as
      // coverage improves, never lower them to make a failing PR pass.
      thresholds: { statements: 85, branches: 75, functions: 83, lines: 88 },
    },
  },
}))
