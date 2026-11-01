import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { SortingState } from '@tanstack/react-table'
import axios from 'axios'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import TicketsTable, { type Ticket } from '../components/TicketsTable.tsx'

async function fetchTickets(sorting: SortingState) {
  const [{ id, desc }] = sorting
  const res = await axios.get<{ tickets: Ticket[] }>('/api/tickets', {
    params: { sortBy: id, sortOrder: desc ? 'desc' : 'asc' },
  })
  return res.data.tickets
}

function TicketsPage() {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }])
  const {
    data: tickets,
    isPending,
    isError,
    isPlaceholderData,
  } = useQuery({
    queryKey: ['tickets', sorting],
    queryFn: () => fetchTickets(sorting),
    // Keep the current rows on screen until the newly sorted ones arrive.
    placeholderData: keepPreviousData,
  })

  return (
    <main className="mx-auto max-w-240 p-6">
      <h1 className="mb-4 text-2xl font-bold">Tickets</h1>
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
