/// <reference types="vitest/config" />
import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Both come from the Netlify build. Without the token no source maps are built or uploaded, so
// the build still works, and production errors in Sentry show minified code.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN
const release = process.env.COMMIT_REF

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(sentryAuthToken
      ? [
          sentryVitePlugin({
            org: 'liz-g2',
            project: 'helpdesk-frontend',
            authToken: sentryAuthToken,
            release: { name: release },
            // Uploaded to Sentry only, so the original code isn't published with the site.
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
          }),
        ]
      : []),
  ],
  define: {
    'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(release ?? ''),
  },
  build: {
    sourcemap: sentryAuthToken ? 'hidden' : false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
})
