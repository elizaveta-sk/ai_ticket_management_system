import type { DailyTicketCount } from 'core/tickets'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const chartConfig = {
  count: { label: 'Tickets', color: 'var(--chart-2)' },
} satisfies ChartConfig

// The days are UTC, so they have to be shown in UTC, or they would move a day west of Greenwich.
function formatDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function TicketsPerDayChart({ days }: { days: DailyTicketCount[] | undefined }) {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Tickets per day</CardTitle>
        <CardDescription>Last 30 days, in UTC</CardDescription>
      </CardHeader>
      <CardContent>
        {!days ? (
          <Skeleton className="h-64 w-full" />
        ) : days.every(({ count }) => count === 0) ? (
          <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No tickets in the last 30 days
          </p>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
              <BarChart accessibilityLayer data={days} barCategoryGap={2} margin={{ left: -16 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  tickFormatter={formatDay}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={48} />
                <ChartTooltip
                  content={<ChartTooltipContent labelFormatter={(date) => formatDay(String(date))} />}
                />
                <Bar dataKey="count" fill="var(--color-count)" maxBarSize={24} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
            {/* The chart's values are only in a tooltip, so screen readers get them as a table. */}
            <div className="sr-only">
              <Table>
                <TableCaption>Tickets per day</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Tickets</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {days.map(({ date, count }) => (
                    <TableRow key={date}>
                      <TableCell>{formatDay(date)}</TableCell>
                      <TableCell>{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default TicketsPerDayChart
