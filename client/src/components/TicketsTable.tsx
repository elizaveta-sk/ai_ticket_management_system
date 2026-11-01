import {
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type OnChangeFn,
  type SortingState,
} from '@tanstack/react-table'
import type { TicketCategory, TicketStatus } from 'core/tickets'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { categoryLabels, statusLabels, uncategorizedLabel } from '@/lib/ticket-labels'

export type Ticket = {
  id: number
  subject: string
  senderName: string
  senderEmail: string
  status: TicketStatus
  category: TicketCategory | null
  createdAt: string
}

const features = tableFeatures({ rowSortingFeature })
const column = createColumnHelper<typeof features, Ticket>()
const noTickets: Ticket[] = []

// Column ids are the sortBy values accepted by ticketSortSchema.
const columns = column.columns([
  column.accessor('subject', {
    header: 'Subject',
    cell: ({ getValue }) => <div className="max-w-72 truncate font-medium">{getValue()}</div>,
  }),
  column.accessor('senderName', {
    header: 'Sender',
    cell: ({ row }) => (
      <>
        <div>{row.original.senderName}</div>
        <div className="text-muted-foreground">{row.original.senderEmail}</div>
      </>
    ),
  }),
  column.accessor('status', {
    header: 'Status',
    cell: ({ getValue }) => (
      <Badge variant={getValue() === 'open' ? 'default' : 'secondary'}>
        {statusLabels[getValue()]}
      </Badge>
    ),
  }),
  column.accessor('category', {
    header: 'Category',
    cell: ({ getValue }) => {
      const category = getValue()
      return category ? (
        categoryLabels[category]
      ) : (
        <span className="text-muted-foreground">{uncategorizedLabel}</span>
      )
    },
  }),
  column.accessor('createdAt', {
    header: 'Created',
    sortDescFirst: true,
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{new Date(getValue()).toLocaleString()}</span>
    ),
  }),
])

const sortIcons = { asc: ArrowUp, desc: ArrowDown }
const ariaSort = { asc: 'ascending', desc: 'descending' } as const

type TicketsTableProps = {
  tickets?: Ticket[]
  isPending: boolean
  isUpdating: boolean
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
}

// Shows skeleton rows while isPending, and a row per ticket once loaded. Sorting
// happens on the server, so this only reports changes and shows rows as given.
function TicketsTable({
  tickets,
  isPending,
  isUpdating,
  sorting,
  onSortingChange,
}: TicketsTableProps) {
  const table = useTable({
    features,
    columns,
    data: tickets ?? noTickets,
    getRowId: (ticket) => String(ticket.id),
    manualSorting: true,
    // The server sorts by one column, and always by something.
    enableMultiSort: false,
    enableSortingRemoval: false,
    // Otherwise the first click's direction depends on the first row's value.
    sortDescFirst: false,
    state: { sorting },
    onSortingChange,
  })

  return (
    <Table aria-busy={isPending || isUpdating}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const sorted = header.column.getIsSorted()
              const SortIcon = sorted ? sortIcons[sorted] : ArrowUpDown
              return (
                <TableHead key={header.id} aria-sort={sorted ? ariaSort[sorted] : 'none'}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2.5"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <table.FlexRender header={header} />
                    <SortIcon
                      data-icon="inline-end"
                      className={sorted ? undefined : 'text-muted-foreground'}
                    />
                  </Button>
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {isPending &&
          ['first', 'second', 'third'].map((row) => (
            <TableRow key={row}>
              <TableCell>
                <Skeleton className="h-4 w-56" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-8 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-14 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
            </TableRow>
          ))}
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id}>
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default TicketsTable
