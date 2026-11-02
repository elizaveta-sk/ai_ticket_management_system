import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const serverDir = path.join(__dirname, 'server')
const clientDir = path.join(__dirname, 'client')

process.loadEnvFile(path.join(serverDir, '.env.test'))

// Tests may wipe data, so never let them run against the development database.
const databaseName = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/').pathname.slice(1)
if (!databaseName.endsWith('_test')) {
  throw new Error('DATABASE_URL must point to a database whose name ends in _test')
}

const serverUrl = process.env.BETTER_AUTH_URL!
const clientUrl = process.env.CLIENT_URL!

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // All tests share one database, so run them one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: clientUrl,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Separate ports from `bun run dev`, and never reuse a running server, so
  // tests can't reach a server connected to the development database.
  webServer: [
    {
      command: 'bun src/index.ts',
      cwd: serverDir,
      url: `${serverUrl}/api/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: process.env.PORT!,
        DATABASE_URL: process.env.DATABASE_URL!,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET!,
        BETTER_AUTH_URL: serverUrl,
        CLIENT_URL: clientUrl,
        INBOUND_EMAIL_SECRET: process.env.INBOUND_EMAIL_SECRET!,
        // Bun would otherwise load the real key from server/.env, and every test email
        // would make a paid call to classify it.
        OPENAI_API_KEY: '',
      },
    },
    {
      command: `bun run dev --port ${new URL(clientUrl).port} --strictPort`,
      cwd: clientDir,
      url: clientUrl,
      reuseExistingServer: false,
      // Vite would otherwise load the real DSN from client/.env, and test errors would reach Sentry.
      env: { API_PROXY_TARGET: serverUrl, VITE_SENTRY_DSN: '' },
    },
  ],
})
