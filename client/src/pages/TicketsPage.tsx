import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { functionalUpdate, type PaginationState, type SortingState } from '@tanstack/react-table'
import axios from 'axios'
import { ticketPageSize, type Ticket } from 'core/tickets'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { classificationRefetchInterval } from '../lib/classification-refetch.ts'
import TicketFilters, { type TicketFilterValues } from '../components/TicketFilters.tsx'
import TicketsTable from '../components/TicketsTable.tsx'

// Waits for a pause in typing, rather than sending a request per keystroke.
const searchDelayMs = 300

async function fetchTickets(
  sorting: SortingState,
  { status, category }: TicketFilterValues,
  search: string,
  { pageIndex, pageSize }: PaginationState,
) {
  const [{ id, desc }] = sorting
  const res = await axios.get<{ tickets: Ticket[]; total: number }>('/api/tickets', {
    params: {
      sortBy: id,
      sortOrder: desc ? 'desc' : 'asc',
      // axios leaves undefined values out of the query string.
      status: status === 'all' ? undefined : status,
      category: category === 'all' ? undefined : category,
      search: search || undefined,
      page: pageIndex + 1,
      pageSize,
    },
  })
  return res.data
}

function TicketsPage() {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }])
  const [filters, setFilters] = useState<TicketFilterValues>({
    search: '',
    status: 'all',
    category: 'all',
  })
  const search = useDebouncedValue(filters.search.trim(), searchDelayMs)

  // A page belongs to one set of results, so other results start from the first page.
  const resultsKey = JSON.stringify([sorting, filters.status, filters.category, search])
  const [page, setPage] = useState({ resultsKey, pageIndex: 0 })
  const pagination: PaginationState = {
    pageIndex: page.resultsKey === resultsKey ? page.pageIndex : 0,
    pageSize: ticketPageSize,
  }

  const { data, isPending, isError, isPlaceholderData } = useQuery({
    queryKey: ['tickets', sorting, filters.status, filters.category, search, pagination.pageIndex],
    queryFn: () => fetchTickets(sorting, filters, search, pagination),
    // Keep the current rows on screen until the new ones arrive.
    placeholderData: keepPreviousData,
    refetchInterval: (query) => classificationRefetchInterval(query.state.data?.tickets),
  })
  const tickets = data?.tickets
  const total = data?.total

  // Tickets can leave these results while they are open, leaving this page empty.
  const lastPageIndex = Math.ceil((total ?? 0) / ticketPageSize) - 1
  if (tickets?.length === 0 && total && !isPlaceholderData && pagination.pageIndex > lastPageIndex) {
    setPage({ resultsKey, pageIndex: lastPageIndex })
  }

  return (
    <main className="mx-auto max-w-240 p-6">
      <h1 className="mb-4 text-2xl font-bold">Tickets</h1>
      <TicketFilters filters={filters} onChange={setFilters} />
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>Could not load tickets</AlertDescription>
        </Alert>
      )}
      {total === 0 && <p className="text-muted-foreground">No tickets found.</p>}
      {(isPending || Boolean(total)) && (
        <TicketsTable
          tickets={tickets}
          total={total}
          isPending={isPending}
          isUpdating={isPlaceholderData}
          sorting={sorting}
          onSortingChange={setSorting}
          pagination={pagination}
          onPaginationChange={(updater) =>
            setPage({ resultsKey, pageIndex: functionalUpdate(updater, pagination).pageIndex })
          }
        />
      )}
    </main>
  )
}

export default TicketsPage
