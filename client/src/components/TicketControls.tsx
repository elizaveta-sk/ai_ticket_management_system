import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import type { TicketAssignee, TicketCategory, TicketStatus } from 'core/tickets'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { categoryLabels, statusLabels, uncategorizedLabel } from '@/lib/ticket-labels'
import { fetchAgents } from '../lib/fetch-agents.ts'
import { serverErrorMessage } from '../lib/server-error-message.ts'

type TicketChanges = {
  status?: TicketStatus
  category?: TicketCategory
  assignedToId?: string | null
}

// Not real values: user ids are UUIDs, and neither of these is a category.
const unassigned = 'unassigned'
const uncategorized = 'uncategorized'

const statusItems: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: statusLabels.open },
  { value: 'resolved', label: statusLabels.resolved },
  { value: 'closed', label: statusLabels.closed },
]

const categoryItems: { value: string; label: string }[] = [
  { value: 'general_question', label: categoryLabels.general_question },
  { value: 'technical_question', label: categoryLabels.technical_question },
  { value: 'refund_request', label: categoryLabels.refund_request },
]

function TicketSelect<T extends string>({
  label,
  items,
  value,
  disabled,
  onChange,
}: {
  label: string
  items: { value: T; label: string }[]
  value: T
  disabled: boolean
  onChange: (value: T) => void
}) {
  return (
    // Label beside the control in a narrow panel, where three in a row would cut off their text.
    <div className="flex min-w-0 items-center gap-2 xl:flex-col xl:items-stretch xl:gap-1">
      <span className="w-22 shrink-0 text-muted-foreground xl:w-auto">{label}</span>
      <Select
        items={items}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next) onChange(next)
        }}
      >
        <SelectTrigger aria-label={label} className="w-full">
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
  )
}

function TicketControls({
  ticketId,
  status,
  category,
  assignedTo,
}: {
  ticketId: number
  status: TicketStatus
  category: TicketCategory | null
  assignedTo: TicketAssignee | null
}) {
  const queryClient = useQueryClient()
  const agents = useQuery({ queryKey: ['agents'], queryFn: fetchAgents })
  const update = useMutation({
    mutationFn: (changes: TicketChanges) => axios.patch(`/api/tickets/${ticketId}`, changes),
    onSuccess: () =>
      // Waits for the refreshed ticket, so the old value doesn't flash back. The list beside
      // it and the counts in the sidebar depend on these fields too.
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ticket', String(ticketId)] }),
        queryClient.invalidateQueries({ queryKey: ['tickets'] }),
      ]),
    // The usual cause is an agent who has since been deleted, so update the choices.
    onError: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })

  // Shows a choice while it saves. A failed save goes back to the saved value.
  const saving = update.isPending ? update.variables : {}
  const shownCategory = saving.category ?? category
  const shownAssigneeId = 'assignedToId' in saving ? saving.assignedToId : assignedTo?.id

  const agentList = agents.data ?? []
  // The current assignee stays listed even if the agents haven't loaded.
  const choices =
    assignedTo && !agentList.some((agent) => agent.id === assignedTo.id)
      ? [...agentList, assignedTo]
      : agentList

  return (
    <div>
      {/* Status gets less room, because its labels are the shortest. */}
      <div className="grid gap-2 xl:grid-cols-[6rem_1fr_1fr]">
        <TicketSelect
          label="Status"
          items={statusItems}
          value={saving.status ?? status}
          disabled={update.isPending}
          onChange={(value) => update.mutate({ status: value })}
        />
        <TicketSelect
          label="Category"
          // A ticket has one category once classified, so this can't be chosen again.
          items={
            shownCategory
              ? categoryItems
              : [{ value: uncategorized, label: uncategorizedLabel }, ...categoryItems]
          }
          value={shownCategory ?? uncategorized}
          disabled={update.isPending}
          onChange={(value) => {
            if (value !== uncategorized) update.mutate({ category: value as TicketCategory })
          }}
        />
        <TicketSelect
          label="Assigned To"
          items={[
            { value: unassigned, label: 'Unassigned' },
            ...choices.map((agent) => ({ value: agent.id, label: agent.name })),
          ]}
          value={shownAssigneeId ?? unassigned}
          disabled={update.isPending || agents.isPending}
          onChange={(value) => update.mutate({ assignedToId: value === unassigned ? null : value })}
        />
      </div>
      {agents.isError && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>Could not load agents</AlertDescription>
        </Alert>
      )}
      {update.isError && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>
            {serverErrorMessage(update.error, 'Could not update ticket')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export default TicketControls
