import {
  createColumnHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table'
import type { Ticket } from 'core/tickets'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Link } from 'react-router'
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
import { TicketCategoryText, TicketStatusBadge } from './TicketFields.tsx'

const features = tableFeatures({ rowSortingFeature, rowPaginationFeature })
const column = createColumnHelper<typeof features, Ticket>()
const noTickets: Ticket[] = []

// Column ids are the sortBy values accepted by ticketSortSchema.
const columns = column.columns([
  column.accessor('subject', {
    header: 'Subject',
    cell: ({ getValue, row }) => (
      <Link
        to={`/tickets/${row.original.id}`}
        className="block max-w-72 truncate font-medium hover:underline"
      >
        {getValue()}
      </Link>
    ),
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
    cell: ({ getValue }) => <TicketStatusBadge status={getValue()} />,
  }),
  column.accessor('category', {
    header: 'Category',
    cell: ({ getValue }) => <TicketCategoryText category={getValue()} />,
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
  total?: number
  isPending: boolean
  isUpdating: boolean
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
  pagination: PaginationState
  onPaginationChange: OnChangeFn<PaginationState>
}

// Shows skeleton rows while isPending, and a row per ticket once loaded. Sorting and
// paging happen on the server, so this only reports changes and shows rows as given.
function TicketsTable({
  tickets,
  total,
  isPending,
  isUpdating,
  sorting,
  onSortingChange,
  pagination,
  onPaginationChange,
}: TicketsTableProps) {
  const table = useTable({
    features,
    columns,
    data: tickets ?? noTickets,
    getRowId: (ticket) => String(ticket.id),
    manualSorting: true,
    manualPagination: true,
    rowCount: total,
    // The server sorts by one column, and always by something.
    enableMultiSort: false,
    enableSortingRemoval: false,
    // Otherwise the first click's direction depends on the first row's value.
    sortDescFirst: false,
    state: { sorting, pagination },
    onSortingChange,
    onPaginationChange,
  })

  return (
    <div>
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
      {total !== undefined && (
        <nav aria-label="Tickets pages" className="mt-4 flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? 'ticket' : 'tickets'}
          </p>
          <p className="ml-auto text-sm text-muted-foreground">
            Page {pagination.pageIndex + 1} of {table.getPageCount()}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  )
}

export default TicketsTable
