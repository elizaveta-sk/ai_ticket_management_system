import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import type { Role } from '../src/generated/prisma/client.ts'
import { prisma } from '../src/lib/prisma.ts'

type CredentialUser = { name: string; email: string; password: string; role: Role }

// Sign-up is disabled, so write the user and credential account directly.
// Safe to re-run: the user's role and password are reset to the given values.
export async function upsertCredentialUser({ name, email, password, role }: CredentialUser) {
  const passwordHash = await hashPassword(password)

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: { role },
      create: { id: randomUUID(), name, email, emailVerified: true, role },
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
}
