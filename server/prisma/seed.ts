import { Role } from '../src/generated/prisma/client.ts'
import { prisma } from '../src/lib/prisma.ts'
import { upsertCredentialUser } from './upsert-credential-user.ts'

const email = process.env.ADMIN_EMAIL
const password = process.env.ADMIN_PASSWORD

if (!email || !password) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set')
}

await upsertCredentialUser({ name: 'Admin', email, password, role: Role.admin })

console.log(`Seeded admin user: ${email}`)

await prisma.$disconnect()
