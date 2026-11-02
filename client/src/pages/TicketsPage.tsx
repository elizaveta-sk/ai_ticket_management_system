import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { functionalUpdate, type PaginationState, type SortingState } from '@tanstack/react-table'
import axios from 'axios'
import { ticketPageSize, type Ticket, type TicketView } from 'core/tickets'
import { useState } from 'react'
import { Outlet, useMatch, useSearchParams } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { cn } from '@/lib/utils'
import PageHeader from '../components/PageHeader.tsx'
import { classificationRefetchInterval } from '../lib/classification-refetch.ts'
import { parseTicketView, viewLabels, viewSortsOldestFirst } from '../lib/ticket-views.ts'
import TicketFilters, { type TicketFilterValues } from '../components/TicketFilters.tsx'
import TicketsTable from '../components/TicketsTable.tsx'

// Waits for a pause in typing, rather than sending a request per keystroke.
const searchDelayMs = 300
// Keeps the list in step with the counts in the sidebar.
const listRefetchMs = 30_000

async function fetchTickets(
  view: TicketView,
  sorting: SortingState,
  { status, category, assignee }: TicketFilterValues,
  search: string,
  { pageIndex, pageSize }: PaginationState,
) {
  const [{ id, desc }] = sorting
  const res = await axios.get<{ tickets: Ticket[]; total: number }>('/api/tickets', {
    params: {
      sortBy: id,
      sortOrder: desc ? 'desc' : 'asc',
      // axios leaves undefined values out of the query string.
      view: view === 'all' ? undefined : view,
      status: status === 'all' ? undefined : status,
      category: category === 'all' ? undefined : category,
      assignedToId: assignee === 'all' ? undefined : assignee,
      search: search || undefined,
      page: pageIndex + 1,
      pageSize,
    },
  })
  return res.data
}

function TicketList({ view, selectedId }: { view: TicketView; selectedId?: string }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: !viewSortsOldestFirst(view) },
  ])
  const [filters, setFilters] = useState<TicketFilterValues>({
    search: '',
    status: 'all',
    category: 'all',
    assignee: 'all',
  })
  const search = useDebouncedValue(filters.search.trim(), searchDelayMs)

  // A page belongs to one set of results, so other results start from the first page.
  const resultsKey = JSON.stringify([
    sorting,
    filters.status,
    filters.category,
    filters.assignee,
    search,
  ])
  const [page, setPage] = useState({ resultsKey, pageIndex: 0 })
  const pagination: PaginationState = {
    pageIndex: page.resultsKey === resultsKey ? page.pageIndex : 0,
    pageSize: ticketPageSize,
  }

  const { data, isPending, isError, isPlaceholderData } = useQuery({
    queryKey: [
      'tickets',
      view,
      sorting,
      filters.status,
      filters.category,
      filters.assignee,
      search,
      pagination.pageIndex,
    ],
    queryFn: () => fetchTickets(view, sorting, filters, search, pagination),
    // Keep the current rows on screen until the new ones arrive.
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      classificationRefetchInterval(query.state.data?.tickets) || listRefetchMs,
  })
  const tickets = data?.tickets
  const total = data?.total

  // Tickets can leave these results while they are open, leaving this page empty.
  const lastPageIndex = Math.ceil((total ?? 0) / ticketPageSize) - 1
  if (tickets?.length === 0 && total && !isPlaceholderData && pagination.pageIndex > lastPageIndex) {
    setPage({ resultsKey, pageIndex: lastPageIndex })
  }

  return (
    // The open ticket sits to the right of the list, and only a phone has no room for both.
    <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col', selectedId && 'hidden md:flex')}>
      <PageHeader title={viewLabels[view]}>
        <TicketFilters view={view} filters={filters} onChange={setFilters} />
      </PageHeader>
      {isError && (
        <Alert variant="destructive" className="m-4 w-auto">
          <AlertDescription>Could not load tickets</AlertDescription>
        </Alert>
      )}
      {total === 0 && <p className="p-4 text-muted-foreground">No tickets found.</p>}
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
          selectedId={selectedId}
          showStatus={view === 'all'}
        />
      )}
    </div>
  )
}

function TicketsPage() {
  const [searchParams] = useSearchParams()
  const view = parseTicketView(searchParams.get('view'))
  const selectedId = useMatch('/tickets/:id')?.params.id

  return (
    <main className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* Keyed so each view starts with its own sort and no leftover filters. */}
      <TicketList key={view} view={view} selectedId={selectedId} />
      <Outlet />
    </main>
  )
}

export default TicketsPage
