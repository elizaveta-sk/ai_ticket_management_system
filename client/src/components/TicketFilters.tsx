import { ticketSearchMaxLength, type TicketCategory, type TicketStatus } from 'core/tickets'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { categoryLabels, statusLabels, uncategorizedLabel } from '@/lib/ticket-labels'

export type TicketFilterValues = {
  search: string
  status: TicketStatus | 'all'
  category: TicketCategory | 'uncategorized' | 'all'
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
}: {
  label: string
  items: Item<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next)
      }}
    >
      <SelectTrigger aria-label={label} className="w-44">
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

function TicketFilters({
  filters,
  onChange,
}: {
  filters: TicketFilterValues
  onChange: (filters: TicketFilterValues) => void
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <div className="relative min-w-56 flex-1">
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
      <FilterSelect
        label="Filter by status"
        items={statusItems}
        value={filters.status}
        onChange={(status) => onChange({ ...filters, status })}
      />
      <FilterSelect
        label="Filter by category"
        items={categoryItems}
        value={filters.category}
        onChange={(category) => onChange({ ...filters, category })}
      />
    </div>
  )
}

export default TicketFilters
