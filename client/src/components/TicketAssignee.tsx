import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { serverErrorMessage } from '../lib/server-error-message.ts'

export type Assignee = { id: string; name: string }

// Assignees are user ids, which are UUIDs, so this can't clash with one.
const unassigned = 'unassigned'

async function fetchAgents() {
  const res = await axios.get<{ agents: Assignee[] }>('/api/agents')
  return res.data.agents
}

function TicketAssignee({
  ticketId,
  assignedTo,
}: {
  ticketId: number
  assignedTo: Assignee | null
}) {
  const queryClient = useQueryClient()
  const agents = useQuery({ queryKey: ['agents'], queryFn: fetchAgents })
  const assign = useMutation({
    mutationFn: (assignedToId: string | null) =>
      axios.patch(`/api/tickets/${ticketId}`, { assignedToId }),
    // Waits for the refreshed ticket, so the old assignee doesn't flash back.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticket', String(ticketId)] }),
    // The usual cause is an agent who has since been deleted, so update the choices.
    onError: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })

  const agentList = agents.data ?? []
  // The current assignee stays listed even if the agents haven't loaded.
  const choices =
    assignedTo && !agentList.some((agent) => agent.id === assignedTo.id)
      ? [...agentList, assignedTo]
      : agentList
  const items = [
    { value: unassigned, label: 'Unassigned' },
    ...choices.map((agent) => ({ value: agent.id, label: agent.name })),
  ]
  // Shows the choice while it saves. A failed save goes back to the saved assignee.
  const assignedToId = assign.isPending ? assign.variables : (assignedTo?.id ?? null)

  return (
    <div className="mb-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Assigned to</span>
        <Select
          items={items}
          value={assignedToId ?? unassigned}
          disabled={assign.isPending || agents.isPending}
          onValueChange={(value) => {
            if (value) assign.mutate(value === unassigned ? null : value)
          }}
        >
          <SelectTrigger aria-label="Assigned to" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {agents.isError && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>Could not load agents</AlertDescription>
        </Alert>
      )}
      {assign.isError && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>
            {serverErrorMessage(assign.error, 'Could not assign ticket')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export default TicketAssignee
