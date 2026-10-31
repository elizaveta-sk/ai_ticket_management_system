import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { createUserSchema } from 'core/users'
import { Router } from 'express'
import { Prisma, Role } from '../generated/prisma/client.ts'
import { prisma } from '../lib/prisma.ts'
import { requireAuth } from '../middleware/require-auth.ts'
import { requireRole } from '../middleware/require-role.ts'

const userSelect = { id: true, name: true, email: true, role: true, createdAt: true } as const

export const usersRouter = Router()

usersRouter.get('/me', requireAuth, (req, res) => {
  const { id, name, email, role } = req.user!
  res.json({ user: { id, name, email, role } })
})

usersRouter.get('/users', requireAuth, requireRole(Role.admin), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: userSelect,
    orderBy: { createdAt: 'asc' },
  })
  res.json({ users })
})

// Sign-up is disabled, so write the user and credential account directly.
// Always creates an agent: the admin is the only admin account.
usersRouter.post('/users', requireAuth, requireRole(Role.admin), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { name, email, password } = parsed.data
  const id = randomUUID()
  try {
    const user = await prisma.user.create({
      data: {
        id,
        name,
        email,
        emailVerified: true,
        role: Role.agent,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: 'credential',
            password: await hashPassword(password),
          },
        },
      },
      select: userSelect,
    })
    res.status(201).json({ user })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'A user with this email already exists' })
      return
    }
    throw error
  }
})
