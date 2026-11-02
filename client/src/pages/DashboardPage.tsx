import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import type { TicketStats } from 'core/tickets'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import PageHeader from '../components/PageHeader.tsx'
import TicketsPerDayChart from '../components/TicketsPerDayChart.tsx'
import { formatDuration } from '../lib/format-duration.ts'

async function fetchStats() {
  const res = await axios.get<{ stats: TicketStats }>('/api/tickets/stats')
  return res.data.stats
}

const noValue = '—'

function statTiles(stats: TicketStats | undefined) {
  return [
    { label: 'Total tickets', value: stats?.total },
    { label: 'Open tickets', value: stats?.open },
    { label: 'Resolved by AI', value: stats?.resolvedByAi },
    {
      label: '% resolved by AI',
      value: stats && (stats.resolvedByAiPercent === null ? noValue : `${stats.resolvedByAiPercent}%`),
    },
    {
      label: 'Average resolution time',
      value:
        stats &&
        (stats.averageResolutionSeconds === null
          ? noValue
          : formatDuration(stats.averageResolutionSeconds)),
    },
  ]
}

function DashboardPage() {
  const { data: stats, isPending, isError } = useQuery({
    queryKey: ['ticket-stats'],
    queryFn: fetchStats,
  })

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader title="Dashboard" />
      {isError ? (
        <Alert variant="destructive" className="m-4 w-auto">
          <AlertDescription>Could not load the dashboard</AlertDescription>
        </Alert>
      ) : (
        <div className="p-4">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-busy={isPending}>
            {statTiles(stats).map(({ label, value }) => (
              <Card key={label}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    <dt>{label}</dt>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dd className="text-2xl font-semibold tabular-nums">
                    {isPending ? <Skeleton className="h-8 w-20" /> : value}
                  </dd>
                </CardContent>
              </Card>
            ))}
          </dl>
          <TicketsPerDayChart days={stats?.ticketsPerDay} />
        </div>
      )}
    </main>
  )
}

export default DashboardPage
