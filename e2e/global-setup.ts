import { execSync } from 'node:child_process'
import path from 'node:path'

// Creates the test database if it doesn't exist, applies any new migrations and
// seeds the admin and agent users. Settings come from server/.env.test, loaded in
// playwright.config.ts.
export default function globalSetup() {
  const options = { cwd: path.join(__dirname, '..', 'server'), stdio: 'inherit' as const }
  execSync('bunx --bun prisma migrate deploy', options)
  execSync('bun prisma/seed.ts', options)
  execSync('bun prisma/seed-e2e.ts', options)
}
