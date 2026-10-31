import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './prisma.ts'

export const auth = betterAuth({
  basePath: '/api/auth',
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  trustedOrigins: [process.env.CLIENT_URL!],
  user: {
    additionalFields: {
      role: {
        type: ['admin', 'agent'],
        required: false,
        defaultValue: 'agent',
        input: false,
      },
    },
  },
})
