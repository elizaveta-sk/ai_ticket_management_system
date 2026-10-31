import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { Role } from '../src/generated/prisma/client.ts'
import { prisma } from '../src/lib/prisma.ts'

const email = process.env.ADMIN_EMAIL
const password = process.env.ADMIN_PASSWORD

if (!email || !password) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set')
}

// Sign-up is disabled, so write the user and credential account directly.
// Safe to re-run: the admin's role and password are reset to the env values.
const passwordHash = await hashPassword(password)

await prisma.$transaction(async (tx) => {
  const user = await tx.user.upsert({
    where: { email },
    update: { role: Role.admin },
    create: { id: randomUUID(), name: 'Admin', email, emailVerified: true, role: Role.admin },
  })

  const account = await tx.account.findFirst({
    where: { userId: user.id, providerId: 'credential' },
  })

  if (account) {
    await tx.account.update({ where: { id: account.id }, data: { password: passwordHash } })
  } else {
    await tx.account.create({
      data: {
        id: randomUUID(),
        accountId: user.id,
        providerId: 'credential',
        userId: user.id,
        password: passwordHash,
      },
    })
  }
})

console.log(`Seeded admin user: ${email}`)

await prisma.$disconnect()
