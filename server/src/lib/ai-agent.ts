// The user that tickets are assigned to while the AI works on them, and that stays on the tickets
// it resolves. Created by prisma/seed-ai-agent.ts. It has no password, so it can't sign in, and
// it's left out of the Users page and the assignee list, so it can't be edited or given work.
export { aiAgentName } from 'core/tickets'
export const aiAgentId = 'jane-ai'
// Reserved, so it can never be a real mailbox. Nothing is ever sent to it.
export const aiAgentEmail = 'jane-ai@system.invalid'
