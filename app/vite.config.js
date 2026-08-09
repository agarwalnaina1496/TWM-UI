import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Only the production build is served from /app/dist via the Vercel rewrite;
  // the dev server serves from its own root, so base must stay default there.
  base: command === 'build' ? '/app/dist/' : '/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
  },
}))
