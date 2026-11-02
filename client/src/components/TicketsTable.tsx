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
import { Link, useLocation, useNavigate } from 'react-router'
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
import { cn } from '@/lib/utils'
import { formatAge, isOverdue } from '../lib/format-age.ts'
import { TicketCategoryText, TicketStatusBadge } from './TicketFields.tsx'

const features = tableFeatures({ rowSortingFeature, rowPaginationFeature })
const column = createColumnHelper<typeof features, Ticket>()
const noTickets: Ticket[] = []

function SubjectLink({ ticket, className }: { ticket: Ticket; className: string }) {
  const { search } = useLocation()
  return (
    // Keeps the current view in the URL, so closing the ticket returns to it.
    <Link
      to={{ pathname: `/tickets/${ticket.id}`, search }}
      title={ticket.subject}
      className={cn('block truncate font-medium hover:underline', className)}
    >
      {ticket.subject}
    </Link>
  )
}

// Column ids are the sortBy values accepted by ticketQuerySchema. The rest can't be sorted.
const idColumn = column.accessor('id', {
  header: 'ID',
  enableSorting: false,
  cell: ({ getValue }) => <span className="text-muted-foreground tabular-nums">{getValue()}</span>,
})
const subjectColumn = column.accessor('subject', {
  header: 'Subject',
  cell: ({ row }) => <SubjectLink ticket={row.original} className="max-w-72" />,
})
const compactSubjectColumn = column.accessor('subject', {
  header: 'Subject',
  cell: ({ row }) => <SubjectLink ticket={row.original} className="max-w-32 lg:max-w-52 2xl:max-w-72" />,
})
const senderColumn = column.accessor('senderName', {
  header: 'Sender',
  cell: ({ row }) => (
    <>
      {row.original.senderName}{' '}
      <span className="ml-1 hidden text-muted-foreground xl:inline">{row.original.senderEmail}</span>
    </>
  ),
})
const compactSenderColumn = column.accessor('senderName', {
  header: 'Sender',
  cell: ({ row }) => <span title={row.original.senderEmail}>{row.original.senderName}</span>,
})
const statusColumn = column.accessor('status', {
  header: 'Status',
  cell: ({ getValue }) => <TicketStatusBadge status={getValue()} />,
})
const categoryColumn = column.accessor('category', {
  header: 'Category',
  cell: ({ getValue, row }) => (
    <TicketCategoryText category={getValue()} isOpen={row.original.status === 'open'} />
  ),
})
const assigneeColumn = column.accessor('assignedTo', {
  header: 'Assignee',
  enableSorting: false,
  cell: ({ getValue }) =>
    getValue()?.name ?? <span className="text-muted-foreground">Unassigned</span>,
})
const createdColumn = column.accessor('createdAt', {
  header: 'Created',
  sortDescFirst: true,
  cell: ({ getValue, row }) => {
    const created = getValue()
    return (
      <time
        dateTime={created}
        title={new Date(created).toLocaleString()}
        className={
          row.original.status === 'open' && isOverdue(created)
            ? 'font-medium text-destructive'
            : 'text-muted-foreground'
        }
      >
        {formatAge(created)}
      </time>
    )
  },
})

const allColumns = column.columns([
  idColumn,
  subjectColumn,
  senderColumn,
  statusColumn,
  categoryColumn,
  assigneeColumn,
  createdColumn,
])
const columnsWithoutStatus = column.columns([
  idColumn,
  subjectColumn,
  senderColumn,
  categoryColumn,
  assigneeColumn,
  createdColumn,
])
// With a ticket open beside the table, only the columns that fit in the space left.
const compactColumns = column.columns([
  compactSubjectColumn,
  compactSenderColumn,
  assigneeColumn,
  createdColumn,
])

// Beside a ticket on a smaller screen, the list keeps only the subject and the age.
const narrowHiddenColumn = 'hidden xl:table-cell'
const narrowHiddenColumnIds = ['senderName', 'assignedTo']

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
  selectedId?: string
  showStatus: boolean
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
  selectedId,
  showStatus,
}: TicketsTableProps) {
  const navigate = useNavigate()
  const { search } = useLocation()
  const fullColumns = showStatus ? allColumns : columnsWithoutStatus
  const table = useTable({
    features,
    columns: selectedId ? compactColumns : fullColumns,
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
  const headers = table.getHeaderGroups().flatMap((headerGroup) => headerGroup.headers)
  const columnClass = (columnId: string) =>
    selectedId && narrowHiddenColumnIds.includes(columnId) ? narrowHiddenColumn : undefined

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Table aria-busy={isPending || isUpdating}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  if (!header.column.getCanSort()) {
                    return (
                      <TableHead key={header.id} className={columnClass(header.column.id)}>
                        <table.FlexRender header={header} />
                      </TableHead>
                    )
                  }
                  const sorted = header.column.getIsSorted()
                  const SortIcon = sorted ? sortIcons[sorted] : ArrowUpDown
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={sorted ? ariaSort[sorted] : 'none'}
                      className={columnClass(header.column.id)}
                    >
                      <Button
                        variant="ghost"
                        size="xs"
                        className="-ml-2 font-medium"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={header} />
                        <SortIcon data-icon="inline-end" className={sorted ? undefined : 'opacity-50'} />
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
                  {headers.map((header) => (
                    <TableCell key={header.id} className={columnClass(header.column.id)}>
                      <Skeleton className="h-4 w-full max-w-32 min-w-10" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.id === selectedId ? 'selected' : undefined}
                aria-current={row.id === selectedId ? 'true' : undefined}
                className="cursor-pointer"
                // The subject is the real link, for the keyboard. This makes the whole row a target.
                onClick={(event) => {
                  if (event.target instanceof Element && event.target.closest('a')) return
                  navigate({ pathname: `/tickets/${row.id}`, search })
                }}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className={columnClass(cell.column.id)}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {total !== undefined && (
        <nav
          aria-label="Tickets pages"
          className="flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-1.5"
        >
          <p className="text-muted-foreground">
            {total} {total === 1 ? 'ticket' : 'tickets'}
          </p>
          <p className="ml-auto text-muted-foreground">
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
    </>
  )
}

export default TicketsTable
