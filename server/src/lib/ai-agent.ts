// The user that tickets are assigned to while the AI works on them, and that stays on the tickets
// it resolves. Created by prisma/seed-ai-agent.ts. It has no password, so it can't sign in, and
// it's left out of the assignee list, so it can't be given work. The Users page shows it, and an
// admin can rename it, but nothing else about it can change.
export { aiAgentId, aiAgentName } from 'core/tickets'
// Reserved, so it can never be a real mailbox. Nothing is ever sent to it.
export const aiAgentEmail = 'jane-ai@system.invalid'
