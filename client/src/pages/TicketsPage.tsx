import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Alert, AlertDescription } from '@/components/ui/alert'
import TicketsTable, { type Ticket } from '../components/TicketsTable.tsx'

async function fetchTickets() {
  const res = await axios.get<{ tickets: Ticket[] }>('/api/tickets')
  return res.data.tickets
}

function TicketsPage() {
  const { data: tickets, isPending, isError } = useQuery({
    queryKey: ['tickets'],
    queryFn: fetchTickets,
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
        <TicketsTable tickets={tickets} isPending={isPending} />
      )}
    </main>
  )
}

export default TicketsPage
