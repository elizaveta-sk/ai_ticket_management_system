import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError } from 'better-auth/api'
import { prisma } from './prisma.ts'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function requireSecret(): string {
  const secret = requireEnv('BETTER_AUTH_SECRET')
  if (secret.length < 32 || secret.startsWith('YOUR_')) {
    throw new Error(
      'BETTER_AUTH_SECRET must be a real secret of at least 32 characters (generate one with: openssl rand -base64 32)',
    )
  }
  return secret
}

export const auth = betterAuth({
  secret: requireSecret(),
  baseURL: requireEnv('BETTER_AUTH_URL'),
  basePath: '/api/auth',
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  trustedOrigins: [requireEnv('CLIENT_URL')],
  databaseHooks: {
    session: {
      create: {
        // A deleted user keeps their password, and knows their id, so they could
        // otherwise sign in with the placeholder email set on deletion.
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { deletedAt: true },
          })
          if (user?.deletedAt) {
            throw new APIError('UNAUTHORIZED', { message: 'Invalid email or password' })
          }
        },
      },
    },
  },
  // Counters are in memory, so they reset on restart and assume a single instance.
  rateLimit: {
    enabled: process.env.NODE_ENV === 'production',
    customRules: { '/sign-in/email': { window: 60, max: 5 } },
  },
  user: {
    additionalFields: {
      role: {
        type: ['admin', 'agent'],
        required: true,
        defaultValue: 'agent',
        input: false,
      },
    },
  },
})
