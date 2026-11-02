import { useQuery } from '@tanstack/react-query'
import {
  ticketSearchMaxLength,
  type TicketCategory,
  type TicketStatus,
  type TicketView,
} from 'core/tickets'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { categoryLabels, statusLabels, uncategorizedLabel } from '@/lib/ticket-labels'
import { fetchAgents } from '../lib/fetch-agents.ts'

export type TicketFilterValues = {
  search: string
  status: TicketStatus | 'all'
  category: TicketCategory | 'uncategorized' | 'all'
  // An agent's id.
  assignee: string
}

type Item<T> = { value: T; label: string }

const statusItems: Item<TicketFilterValues['status']>[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'open', label: statusLabels.open },
  { value: 'resolved', label: statusLabels.resolved },
  { value: 'closed', label: statusLabels.closed },
]

const categoryItems: Item<TicketFilterValues['category']>[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'general_question', label: categoryLabels.general_question },
  { value: 'technical_question', label: categoryLabels.technical_question },
  { value: 'refund_request', label: categoryLabels.refund_request },
  { value: 'uncategorized', label: uncategorizedLabel },
]

function FilterSelect<T extends string>({
  label,
  items,
  value,
  onChange,
  onOpen,
}: {
  label: string
  items: Item<T>[]
  value: T
  onChange: (value: T) => void
  onOpen?: () => void
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next)
      }}
      onOpenChange={(open) => {
        if (open) onOpen?.()
      }}
    >
      <SelectTrigger aria-label={label} className="w-40">
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
  )
}

function AssigneeFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  // Loaded when first opened, because most visits to this page never use it.
  const [isWanted, setIsWanted] = useState(false)
  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: fetchAgents,
    enabled: isWanted,
  })

  return (
    <FilterSelect
      label="Filter by assignee"
      items={[
        { value: 'all', label: 'All Assignees' },
        ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
      ]}
      value={value}
      onChange={onChange}
      onOpen={() => setIsWanted(true)}
    />
  )
}

// Only the filters that can narrow the view further.
function TicketFilters({
  view,
  filters,
  onChange,
}: {
  view: TicketView
  filters: TicketFilterValues
  onChange: (filters: TicketFilterValues) => void
}) {
  return (
    <>
      <div className="relative min-w-44 flex-1 md:max-w-72">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search tickets"
          placeholder="Search subject or sender"
          className="pl-8"
          maxLength={ticketSearchMaxLength}
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
        />
      </div>
      {view === 'all' && (
        <FilterSelect
          label="Filter by status"
          items={statusItems}
          value={filters.status}
          onChange={(status) => onChange({ ...filters, status })}
        />
      )}
      {view !== 'refunds' && (
        <FilterSelect
          label="Filter by category"
          items={categoryItems}
          value={filters.category}
          onChange={(category) => onChange({ ...filters, category })}
        />
      )}
      {view !== 'mine' && view !== 'unassigned' && (
        <AssigneeFilter
          value={filters.assignee}
          onChange={(assignee) => onChange({ ...filters, assignee })}
        />
      )}
    </>
  )
}

export default TicketFilters
