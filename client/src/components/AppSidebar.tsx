import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { ticketViews, type TicketViewCounts } from 'core/tickets'
import { Link, NavLink, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { parseTicketView, ticketViewHref, viewLabels } from '../lib/ticket-views.ts'

// Other people's changes and new tickets show up without a reload.
const countsRefetchMs = 30_000

async function fetchViewCounts() {
  const res = await axios.get<{ counts: TicketViewCounts }>('/api/tickets/view-counts')
  return res.data.counts
}

function linkClass(isActive: boolean) {
  return cn(
    'flex shrink-0 items-center justify-between gap-3 rounded-md px-2 py-2.5 whitespace-nowrap text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground md:py-1.5',
    isActive && 'bg-sidebar-accent font-medium text-sidebar-foreground',
  )
}

function AppSidebar({
  userName,
  isAdmin,
  onSignOut,
}: {
  userName: string
  isAdmin: boolean
  onSignOut: () => void
}) {
  const { pathname, search } = useLocation()
  const { data: counts } = useQuery({
    // Under "tickets", so anything that refreshes the ticket list refreshes these too.
    queryKey: ['tickets', 'view-counts'],
    queryFn: fetchViewCounts,
    refetchInterval: countsRefetchMs,
  })

  const onTickets = pathname === '/tickets' || pathname.startsWith('/tickets/')
  const currentView = onTickets ? parseTicketView(new URLSearchParams(search).get('view')) : null
  // Tickets can only be assigned to agents, so this would always be empty for an admin.
  const views = ticketViews.filter((view) => view !== 'mine' || !isAdmin)

  return (
    <aside className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-sidebar-border bg-sidebar p-2 text-sidebar-foreground md:w-56 md:flex-col md:flex-nowrap md:items-stretch md:gap-4 md:border-r md:border-b-0">
      <Link to="/" className="mr-auto rounded-md px-2 py-1 font-semibold md:mr-0">
        Helpdesk
      </Link>
      <div className="order-3 flex w-full flex-col gap-1 md:order-none md:min-h-0 md:flex-1 md:gap-4 md:overflow-y-auto">
        <nav aria-label="Main" className="flex gap-px overflow-x-auto md:flex-col">
          <NavLink to="/dashboard" className={({ isActive }) => linkClass(isActive)}>
            Dashboard
          </NavLink>
          {isAdmin && (
            <NavLink to="/users" className={({ isActive }) => linkClass(isActive)}>
              Users
            </NavLink>
          )}
        </nav>
        <nav aria-labelledby="ticket-views-heading" className="flex flex-col gap-px">
          <h2
            id="ticket-views-heading"
            className="hidden px-2 py-1 font-normal text-muted-foreground md:block"
          >
            Tickets
          </h2>
          <div className="flex gap-px overflow-x-auto md:flex-col">
            {views.map((view) => (
              <Link
                key={view}
                to={ticketViewHref(view)}
                aria-current={view === currentView ? 'page' : undefined}
                className={linkClass(view === currentView)}
              >
                {viewLabels[view]}{' '}
                {counts && (
                  <span className="font-normal text-muted-foreground tabular-nums">
                    {counts[view]}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </nav>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2 px-2">
        <span className="truncate">{userName}</span>
        <Button type="button" variant="ghost" size="xs" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </aside>
  )
}

export default AppSidebar
