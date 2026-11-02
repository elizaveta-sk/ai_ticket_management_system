import { Role } from '../src/generated/prisma/client.ts'
import { aiAgentEmail, aiAgentId, aiAgentName } from '../src/lib/ai-agent.ts'
import { prisma } from '../src/lib/prisma.ts'

// Needed in every environment, including production, and safe to run again. There's deliberately
// no account row, because that is what would hold a password and let this user sign in.
const fields = { name: aiAgentName, email: aiAgentEmail, role: Role.agent }

await prisma.user.upsert({
  where: { id: aiAgentId },
  create: { id: aiAgentId, ...fields },
  // The name is left alone, so a rename by the admin survives running this again.
  update: { email: aiAgentEmail, role: Role.agent, deletedAt: null, deletedEmail: null },
})

console.log(`Seeded AI agent: ${aiAgentName}`)

await prisma.$disconnect()
