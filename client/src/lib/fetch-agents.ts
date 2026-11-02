import axios from 'axios'
import type { TicketAssignee } from 'core/tickets'

export async function fetchAgents() {
  const res = await axios.get<{ agents: TicketAssignee[] }>('/api/agents')
  return res.data.agents
}
