import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { createUserSchema, updateAiAgentSchema, updateUserSchema } from 'core/users'
import { Router } from 'express'
import { Prisma, Role } from '../generated/prisma/client.ts'
import { aiAgentId } from '../lib/ai-agent.ts'
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
    where: { deletedAt: null },
    select: userSelect,
    orderBy: { createdAt: 'asc' },
  })
  res.json({ users })
})

// The agents a ticket can be assigned to. Any signed-in user can read these, unlike
// /users, so this returns only what the assignee list shows.
usersRouter.get('/agents', requireAuth, async (_req, res) => {
  const agents = await prisma.user.findMany({
    where: { role: Role.agent, deletedAt: null, id: { not: aiAgentId } },
    select: { id: true, name: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })
  res.json({ agents })
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

// Writes the rows directly, like POST above. Never changes the role.
usersRouter.put('/users/:id', requireAuth, requireRole(Role.admin), async (req, res) => {
  // Express types params as string | string[], but a named segment is always a string.
  const id = req.params.id as string
  // The AI agent can only be renamed: a password would let someone sign in as it.
  if (id === aiAgentId) {
    const renamed = updateAiAgentSchema.safeParse(req.body)
    if (!renamed.success) {
      res.status(400).json({ error: renamed.error.issues[0].message })
      return
    }
    try {
      const user = await prisma.user.update({
        where: { id, deletedAt: null },
        data: { name: renamed.data.name },
        select: userSelect,
      })
      res.json({ user })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        res.status(404).json({ error: 'User not found' })
        return
      }
      throw error
    }
    return
  }

  const parsed = updateUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { name, email, password } = parsed.data
  const passwordHash = password ? await hashPassword(password) : undefined
  try {
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id, deletedAt: null },
        data: { name, email },
        select: userSelect,
      })

      if (passwordHash) {
        const account = await tx.account.findFirst({
          where: { userId: id, providerId: 'credential' },
        })
        if (account) {
          await tx.account.update({ where: { id: account.id }, data: { password: passwordHash } })
        } else {
          await tx.account.create({
            data: {
              id: randomUUID(),
              accountId: id,
              providerId: 'credential',
              userId: id,
              password: passwordHash,
            },
          })
        }
        // Whoever had the old password loses access now. The admin making this
        // request stays signed in when changing their own password.
        await tx.session.deleteMany({ where: { userId: id, id: { not: req.session!.id } } })
      }

      return updated
    })
    res.json({ user })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'User not found' })
        return
      }
      if (error.code === 'P2002') {
        res.status(409).json({ error: 'A user with this email already exists' })
        return
      }
    }
    throw error
  }
})

// Soft delete: the row stays, and the email moves to deletedEmail so it can be
// reused. The session hook in lib/auth.ts stops the placeholder email signing in.
// Their tickets go back to being unassigned, so nobody is left waiting on them.
usersRouter.delete('/users/:id', requireAuth, requireRole(Role.admin), async (req, res) => {
  const id = req.params.id as string
  const user =
    id === aiAgentId ? null : await prisma.user.findFirst({ where: { id, deletedAt: null } })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  if (user.role === Role.admin) {
    res.status(403).json({ error: 'The admin account cannot be deleted' })
    return
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedEmail: user.email,
        email: `deleted-${id}@deleted.invalid`,
      },
    }),
    prisma.session.deleteMany({ where: { userId: id } }),
    prisma.ticket.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } }),
  ])
  res.status(204).end()
})
