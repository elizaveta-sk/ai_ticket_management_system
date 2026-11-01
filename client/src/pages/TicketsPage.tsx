import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { SortingState } from '@tanstack/react-table'
import axios from 'axios'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import TicketFilters, { type TicketFilterValues } from '../components/TicketFilters.tsx'
import TicketsTable, { type Ticket } from '../components/TicketsTable.tsx'

// Waits for a pause in typing, rather than sending a request per keystroke.
const searchDelayMs = 300

async function fetchTickets(
  sorting: SortingState,
  { status, category }: TicketFilterValues,
  search: string,
) {
  const [{ id, desc }] = sorting
  const res = await axios.get<{ tickets: Ticket[] }>('/api/tickets', {
    params: {
      sortBy: id,
      sortOrder: desc ? 'desc' : 'asc',
      // axios leaves undefined values out of the query string.
      status: status === 'all' ? undefined : status,
      category: category === 'all' ? undefined : category,
      search: search || undefined,
    },
  })
  return res.data.tickets
}

function TicketsPage() {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }])
  const [filters, setFilters] = useState<TicketFilterValues>({
    search: '',
    status: 'all',
    category: 'all',
  })
  const search = useDebouncedValue(filters.search.trim(), searchDelayMs)
  const {
    data: tickets,
    isPending,
    isError,
    isPlaceholderData,
  } = useQuery({
    queryKey: ['tickets', sorting, filters.status, filters.category, search],
    queryFn: () => fetchTickets(sorting, filters, search),
    // Keep the current rows on screen until the newly sorted or filtered ones arrive.
    placeholderData: keepPreviousData,
  })

  return (
    <main className="mx-auto max-w-240 p-6">
      <h1 className="mb-4 text-2xl font-bold">Tickets</h1>
      <TicketFilters filters={filters} onChange={setFilters} />
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>Could not load tickets</AlertDescription>
        </Alert>
      )}
      {tickets?.length === 0 && <p className="text-muted-foreground">No tickets found.</p>}
      {(isPending || (tickets && tickets.length > 0)) && (
        <TicketsTable
          tickets={tickets}
          isPending={isPending}
          isUpdating={isPlaceholderData}
          sorting={sorting}
          onSortingChange={setSorting}
        />
      )}
    </main>
  )
}

export default TicketsPage
