import { Role } from '../src/generated/prisma/client.ts'
import { prisma } from '../src/lib/prisma.ts'
import { upsertCredentialUser } from './upsert-credential-user.ts'

// Test-only accounts, run by e2e/global-setup.ts. Kept out of seed.ts so that
// deployments never get them.
const email = process.env.AGENT_EMAIL
const password = process.env.AGENT_PASSWORD

if (!email || !password) {
  throw new Error('AGENT_EMAIL and AGENT_PASSWORD must be set')
}

await upsertCredentialUser({ name: 'Test Agent', email, password, role: Role.agent })

console.log(`Seeded agent user: ${email}`)

await prisma.$disconnect()
