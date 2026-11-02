import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import type { TicketStats } from 'core/tickets'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
    <main className="mx-auto max-w-240 p-6">
      <h1 className="mb-4 text-2xl font-bold">Dashboard</h1>
      {isError ? (
        <Alert variant="destructive">
          <AlertDescription>Could not load the dashboard</AlertDescription>
        </Alert>
      ) : (
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy={isPending}>
          {statTiles(stats).map(({ label, value }) => (
            <Card key={label}>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  <dt>{label}</dt>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dd className="text-3xl font-semibold tabular-nums">
                  {isPending ? <Skeleton className="h-9 w-20" /> : value}
                </dd>
              </CardContent>
            </Card>
          ))}
        </dl>
      )}
    </main>
  )
}

export default DashboardPage
