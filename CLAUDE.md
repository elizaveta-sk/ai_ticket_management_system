# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Bun is the runtime and package manager (Bun workspaces: `client`, `server`, `core`). Run from the repo root:

- `bun install`: install dependencies for all workspaces
- `bun --filter server db:migrate`: create/apply a Prisma migration after editing `server/prisma/schema.prisma`
- `bun --filter server db:generate`: regenerate the Prisma client (also runs on `bun install`)
- `bun --filter server db:seed:ai-agent`: create the Jane AI agent, needed in every environment including production (safe to run again)
- `bun --filter server db:seed`: create or update the admin user from `ADMIN_EMAIL` and `ADMIN_PASSWORD`
- `bun --filter server db:seed:tickets`: add 100 sample tickets for development (refuses to run in production)
- `bun --filter server db:seed:replies`: add a 20-reply conversation to ticket 7 for development (refuses to run in production, and running it again adds nothing)
- `bun --filter server db:studio`: open Prisma Studio
- `bun run db:up` / `bun run db:down`: optional PostgreSQL in Docker (`docker-compose.yml`)
- `bun run dev`: run client (Vite, http://localhost:5173) and server (http://localhost:3000) together
- `bun run build`: build the client
- `bun --filter server typecheck`: typecheck the server
- `bun --filter client lint`: lint the client (oxlint)
- `bun --filter client test`: run the client component tests (Vitest and React Testing Library)
- `bun --filter core test`: run the `core` unit tests (Vitest)
- `bun --filter server test`: run the server unit tests (Vitest), which mock the database and the model
- `cd client && bunx --bun shadcn@latest add <component>`: add a shadcn/ui component

The server reads `server/.env` (copy from `server/.env.example`). Development uses a local PostgreSQL 18 on port 5433 with the `helpdesk` database.

## Architecture

- `client/`: React + TypeScript (Vite). The Vite dev server proxies `/api/*` to the Express server, so the client calls relative `/api` URLs, using axios inside TanStack Query (`useQuery`; the `QueryClient` is in `src/main.tsx`) rather than `fetch` and `useEffect`. Sign-out clears the query cache. UI is built from shadcn/ui components in `src/components/ui` (style `base-nova`, built on Base UI rather than Radix; config in `components.json`, theme variables in `src/index.css`), imported through the `@/*` alias for `src/*`. Forms combine them with React Hook Form's `Controller` and Zod; see `src/pages/LoginPage.tsx`.
- `server/`: Express + TypeScript, run directly by Bun (no build step). `src/app.ts` defines the app and mounts routes; route modules live in `src/routes` (user endpoints are in `src/routes/users.ts`); `src/index.ts` starts the listener. Database access goes through Prisma 7 (`src/lib/prisma.ts`, using the `@prisma/adapter-pg` driver adapter). The client is generated into `src/generated/prisma` (gitignored); `prisma.config.ts` loads `.env` via dotenv.
- `core/`: code shared by client and server, run from source with no build step. Each `core/src/<name>.ts` is imported as `core/<name>`, such as `core/users`.
- `e2e/`: Playwright end-to-end tests. See Testing below.
- `implementation-plan.md` tracks progress as a phase-by-phase checklist.

## Authentication

Better Auth with email and password, using database-backed sessions through the Prisma adapter (`user`, `session`, `account` and `verification` tables).

- **Server config:** `server/src/lib/auth.ts`. Requires `BETTER_AUTH_SECRET` (at least 32 characters), `BETTER_AUTH_URL` and `CLIENT_URL` (the only trusted origin) in `server/.env`; the server refuses to start without them. Rate limiting is on only when `NODE_ENV=production`, with `/sign-in/email` limited to 5 attempts per minute, using in-memory counters.
- **Routes:** `app.ts` mounts Better Auth at `/api/auth/*`. This must stay before `express.json()`, because Better Auth reads the raw request body.
- **Protecting API routes:** add the `requireAuth` middleware (`server/src/middleware/require-auth.ts`). It returns 401 when there is no session and otherwise sets `req.user` and `req.session` (typed in `server/src/types/express.d.ts`). Routes are public unless they use it.
- **Roles:** `role` is `admin` or `agent` (default `agent`), a Better Auth additional field with `input: false`, so clients cannot set it. `requireAuth` only checks for a session, so admin-only routes also need `requireRole('admin')` after it (`server/src/middleware/require-role.ts`), which returns 403 for any other role. In server code, use the `Role` enum from `src/generated/prisma/client.ts` (`Role.agent`, `Role.admin`) instead of hardcoding role strings.
- **Creating users:** public sign-up is disabled (`disableSignUp: true`). The Better Auth sign-up endpoint is unavailable, so `server/prisma/seed.ts` writes the `user` row and a `credential` `account` row directly through `upsertCredentialUser` (`server/prisma/upsert-credential-user.ts`), hashing the password with `hashPassword` from `better-auth/crypto`. Re-running the seed resets the admin's role and password to the env values. At runtime the admin creates agents through `POST /api/users` in `server/src/routes/users.ts`, which also writes both rows directly. It must not use `upsertCredentialUser`, which would reset an existing user's password; a duplicate email returns 409 instead. `PUT /api/users/:id` also updates the rows directly and must not use `upsertCredentialUser`, which matches by email and sets the role. A blank password keeps the current one; a new one signs that user out of their other sessions.
- **Deleting users:** `DELETE /api/users/:id` is a soft delete, and admin accounts cannot be deleted. It sets `deletedAt`, moves the email to `deletedEmail` so it can be reused, replaces `email` with a placeholder and deletes the user's sessions. The `session.create.before` hook in `server/src/lib/auth.ts` stops deleted users signing in. Queries that read users must filter on `deletedAt: null`.
- **Client:** use `authClient` from `client/src/lib/auth-client.ts` (`useSession`, `signIn.email`, `signOut`). `ProtectedLayout` redirects to `/login` when signed out, so put protected pages under it in `client/src/App.tsx`. Nest admin-only pages inside `AdminRoute` as well, which redirects non-admins to `/`. `session.user.role` is typed by `inferAdditionalFields` in `auth-client.ts`, because the client cannot import the server's auth config. `LoginPage` redirects signed-in users to `/`. These redirects are UX only; the server must enforce access.

## Contact form

`/contact` is a public page (`client/src/pages/ContactPage.tsx`, linked from the login page) that posts to `POST /api/contact` (`server/src/routes/contact.ts`), validated by `contactFormSchema` in `core/src/tickets.ts`. It creates a ticket and classifies it in the background, the same as an inbound email, with a generated `contact-` message id. Senders are answered by email, the same as anyone else (see Outbound email and auto-resolve).

- **Spam:** the hidden `website` field is a trap, so a request that fills it in gets a 201 and creates nothing. The route allows 20 requests per minute and 500 per day in total across all visitors (`rateLimitTotal`, in-memory), which also caps what spam can cost in model calls. It is deliberately not per visitor, because the headers that identify a visitor can be faked.

## Inbound email

SendGrid sends outbound email, and its Inbound Parse feeds replies to existing tickets (see Email replies), but no provider feeds new tickets from email yet. `POST /api/webhooks/inbound-email` (`server/src/routes/webhooks.ts`) takes a provider-neutral JSON body, validated by `inboundEmailSchema` in `core/src/tickets.ts`, and creates a ticket with no category. After answering, it processes the ticket in the background without waiting (`processTicketInBackground` in `server/src/lib/process-ticket.ts`), which classifies it (`server/src/lib/classify-ticket.ts`, using OpenAI `gpt-5-nano`) and then tries to auto-resolve it (see Ticket states). The category stays null without `OPENAI_API_KEY`, if classification fails, or if the server restarts first, and classification never overwrites a category an agent has set. The ticket list and detail pages refetch every 2 seconds while a ticket under 2 minutes old has no category (`client/src/lib/classification-refetch.ts`), so the category appears without a reload. `fromName` is required, so an email without one gets a 400. When a provider is chosen, map its webhook format to that schema and replace the secret check with its signature check.

- **Missed classifications:** `startTicketSweep` (`server/src/lib/process-ticket.ts`, started from `src/index.ts`) retries tickets from both email and the contact form when the server starts, then 10 minutes after each sweep finishes. It moves tickets stuck in `processing` for 10 minutes to `open` without running the AI again, because the student may already have been emailed. It runs tickets still `new` after 2 minutes through full processing. It also retries classification, but not auto-resolve, on `open` tickets with no category created between 2 minutes and 24 hours ago, up to 20 at a time, oldest first. The 2-minute minimum avoids repeating a classification still running, and after 24 hours a ticket stays uncategorized until an agent sets it. It assumes a single server instance, because extra instances would repeat each other's model calls. The client stops refetching after 2 minutes, so a category the sweep adds appears on the next reload or refetch.
- **Length limits:** `from` is at most 100 characters and `text` at most 20,000 (`inboundEmailSchema`); longer values get a 400 and no ticket is created. Replies share the 20,000 limit.
- **Authentication:** the request must send `INBOUND_EMAIL_SECRET` in the `x-webhook-secret` header (`server/src/middleware/require-webhook-secret.ts`). If the secret is missing or is a placeholder, the endpoint returns 503 rather than accepting anything.
- **Duplicates:** `messageId` is unique, so a repeated delivery returns 200 with the existing ticket instead of creating another.
- **Mounting:** the router stays before `express.json()` in `app.ts` because it sets its own 1mb body limit.

## Ticket states

A ticket moves `new` -> `processing` -> `resolved` or `open`, through `moveTicket` (`server/src/lib/ticket-state.ts`), which holds the allowed moves and only changes a ticket still in the expected state. After that, agents move tickets freely between `open`, `resolved` and `closed` through `PATCH /api/tickets/:id`.

- **Internal states:** `new` and `processing` never leave the server. API responses go through `visibleTicketStatus` (`core/src/tickets.ts`), which shows them as `open`, and `GET /api/tickets` leaves those tickets out. They can be seen in the database, such as through Prisma Studio.
- **Starting state:** routes create tickets with `initialTicketStatus()` (`server/src/lib/process-ticket.ts`), which is `open` without `OPENAI_API_KEY`, so tickets reach agents straight away when nothing can process them. Anything else that creates tickets must set a status too, because the column defaults to `new`, and a `new` ticket stays hidden until a sweep picks it up.
- **AI agent:** `startProcessing` assigns a ticket to Jane AI (`server/src/lib/ai-agent.ts`) as it enters `processing`, unless someone is already assigned. A ticket the AI resolves stays with Jane AI. `handOverToAgents` moves any other ticket to `open`, including stuck ones the sweep recovers, and assigns it to the active agent whose email is `DEFAULT_AGENT_EMAIL` (Lucy, in production). Without that agent it stays unassigned, and a wrong address also logs a warning. Reopening a ticket through `PATCH` or an email reply unassigns it from Jane AI rather than assigning it to the default agent. Another assignee is never removed. Without the seed, tickets are processed unassigned and a warning is logged.
- **Jane AI is not a login:** it has no account row, so it can't sign in, and `GET /api/users` and `GET /api/agents` leave it out. `PUT` and `DELETE /api/users/:id` return 404 for it, and `PATCH /api/tickets/:id` won't assign tickets to it. `TicketControls` still shows it as the current assignee on its own tickets.
- **Enum migrations:** PostgreSQL can't use a new enum value in the migration that adds it, so setting a default to one takes a second migration.

## Tickets page

`AppSidebar` lists the ticket views with their counts (`GET /api/tickets/view-counts`), for every page under `ProtectedLayout`. `/tickets` shows a view chosen by `?view=` (`client/src/lib/ticket-views.ts`), and `/tickets/:id` is a nested route that opens that ticket in a panel beside the list.

- **Views:** the names are in `ticketViews` (`core/src/tickets.ts`), and each view's filter is in `viewFilters` (`server/src/routes/tickets.ts`), which both the list and the counts use. `GET /api/tickets` defaults to `all`, while the page defaults to `open` ("Needs a person"). Assigned to me is hidden from admins, because tickets can only be assigned to agents.
- **Polling:** the list and the counts refetch every 30 seconds. Both query keys start with `tickets`, so invalidating that refreshes both.
- **Narrow screens:** the open ticket sits to the right of the list from the `md` breakpoint up, and the list drops to subject and age below `xl`. On a phone, the ticket replaces the list.
- **Reply drafts:** `ReplyForm` keeps each ticket's draft in the query cache under `reply-draft` (no expiry, set in `main.tsx`), so moving between tickets doesn't lose it. Sign-out clears it along with the rest of the cache, and a reload loses it.

## Dashboard

`/dashboard` (`client/src/pages/DashboardPage.tsx`) shows `GET /api/tickets/stats`, for any signed-in user. Total counts every ticket that has finished processing, including AI-resolved ones, the same as the ticket list's total. The percentage is AI-resolved tickets out of that total. The average is from `createdAt` to `resolvedAt` across all resolved tickets, by AI or agents, and tickets resolved before `resolvedAt` existed don't count. `resolvedAt` keeps the first resolution, stays set when a ticket is closed, and clears when it's reopened. Below the numbers, `TicketsPerDayChart` shows tickets created on each of the last 30 days, using shadcn's `chart` component (Recharts). It counts the same tickets as the total, and its days are UTC. Recharts can't draw in jsdom, so component tests check the screen-reader table beside the chart.

## Outbound email and auto-resolve

`server/src/lib/email.ts` sends plain-text email through SendGrid. It needs `SENDGRID_API_KEY` and `EMAIL_FROM` in `server/.env`, and `EMAIL_FROM` must be on a domain authenticated in SendGrid. Without them nothing is sent, and the rest of the app works as normal. Replies to these emails come back into the app (see Email replies), or go to the `EMAIL_FROM` mailbox when that isn't configured.

- **Agent replies:** `POST /api/tickets/:id/replies` saves the reply and then emails it to the ticket's sender. If the email fails, the reply stays saved and the response has `emailFailed: true`, which `TicketReplies` shows to the agent.
- **Auto-resolve:** `autoResolveTicket` (`server/src/lib/auto-resolve-ticket.ts`) runs after classification, using OpenAI `gpt-5-nano` through the Vercel AI SDK and `server/knowledge-base.md`, which is read on each attempt, so edits apply without code changes. When the knowledge base fully answers the ticket, it emails the answer, moves the ticket to `resolved`, sets `resolvedByAi` to true, and saves a reply with sender type `ai`, which the ticket page shows as coming from Jane AI. Otherwise the ticket moves to `open` for an agent, with no email sent. It needs `OPENAI_API_KEY` and working email, and does nothing without them.
- **In the list:** `GET /api/tickets` includes `resolvedByAi` tickets, which show as `resolved`. Changing such a ticket's status to anything but `resolved` clears the flag, so it stops counting as resolved by AI on the dashboard.
- **Never answered automatically:** refund requests, tickets an agent has assigned, replied to or changed, and tickets from an address that has had 3 automatic answers in 24 hours. The last rule limits auto-responder loops and misuse of the contact form, which accepts anyone's address.
- **Untrusted input:** `isSafeAutoAnswer` (`core/src/auto-resolve.ts`) rejects any answer with a link or domain, and the subject is fixed, so nothing a sender wrote can be forwarded to someone else's inbox. `formatAutoReply` greets by first name only if it looks like a single name, and otherwise says "Hi there". Don't add the full name or subject to these emails.
- **Logs:** each attempt logs its outcome with the ticket id and no email content, such as `Ticket 7 left for an agent: ...` or `Ticket 7 resolved automatically`.
- **Format:** `formatAutoReply` adds the greeting, a line inviting further questions by reply, and the sign-off ("Best, Jane, Support team"). The visible text doesn't say the answer is automated; the `Auto-Submitted` header stays, to stop auto-responder loops. Agents' replies aren't changed, and the Polish button signs them with the agent's own name.
- **Order:** the email is sent before the ticket is saved as resolved. After a failed save the sweep opens the ticket, whereas the other order could hide a ticket whose student never got an answer.

## Email replies

Emails to students set a Reply-To of `ticket-<id>-<signature>@<INBOUND_REPLY_DOMAIN>` (`server/src/lib/reply-address.ts`). SendGrid Inbound Parse receives the answer and posts it to `POST /api/webhooks/inbound-parse/:secret` (`server/src/routes/inbound-parse.ts`), which saves a `customer` reply and moves a resolved or closed ticket to `open`, clearing `resolvedByAi` and `resolvedAt`. The AI doesn't answer these, and no email goes out. Without both `INBOUND_REPLY_DOMAIN` and `INBOUND_PARSE_SECRET` (at least 32 characters), there's no Reply-To, so answers go to the `EMAIL_FROM` mailbox.

- **Domain:** Inbound Parse takes over all mail for its hostname, so it needs a dedicated subdomain with an MX record for `mx.sendgrid.net`. Never point the main domain at it, because that would cut off the mailbox.
- **Authentication:** Inbound Parse can't send a custom header, so the secret is in the URL, and should be letters and numbers only (`openssl rand -hex 32`). Changing it changes every reply address, so answers to older emails are ignored.
- **Ignored with a 200, and logged without content:** addresses this app didn't issue, automatic emails such as out-of-office answers, and senders matching neither the ticket's address nor the envelope. A 200 stops SendGrid retrying.
- **Content:** `customerReplyBody` (`core/src/email-reply.ts`) removes the quoted earlier message where it recognizes the client's format. Attachments aren't stored; the reply says how many there were.
- **Not covered:** new emails sent to the `EMAIL_FROM` mailbox don't create tickets, and emails sent before this was configured still have replies going to that mailbox.

## Error monitoring

Sentry (org `liz-g2`, EU region) has one project for each side: `helpdesk-backend` and `helpdesk-frontend`. Without a DSN nothing is sent, and the app works as normal.

- **Server:** `server/src/instrument.ts` uses `@sentry/bun`, needs `SENTRY_DSN`, and is loaded by `--preload` in the `dev` and `start` scripts, so a plain `bun src/index.ts` (as in the e2e tests) has no Sentry. `setupExpressErrorHandler` in `app.ts` stays after every route. Errors the code catches itself never reach Sentry on their own, so new catch blocks that hide a real failure need `reportError` (`server/src/lib/report-error.ts`), which sends only the name, message and stack.
- **Client:** `client/src/instrument.ts` uses `@sentry/react` and needs `VITE_SENTRY_DSN`. There's no Session Replay, because the pages show students' tickets.
- **Environment:** `SENTRY_ENVIRONMENT` on the server and `VITE_SENTRY_ENVIRONMENT` on the client, which are `production` on Render and Netlify. Vite reads the client's at build time, so changing it on Netlify takes a new deploy.
- **Readable client errors:** with `SENTRY_AUTH_TOKEN` in the build, `sentryVitePlugin` (`client/vite.config.ts`) uploads source maps and deletes them from `dist`. Without it, no source maps are built.
- **Privacy:** tickets hold students' personal data, and the SDK collects more than `sendDefaultPii` suggests: with it off, spans still carried request bodies, IP addresses and the full text of model calls. `scrubSentryEvent` and `scrubSentrySpan` (`core/src/sentry-scrub.ts`) remove these, along with email addresses, headers, query strings and the inbound parse secret. Errors go through `beforeSend` and spans through `beforeSendSpan`; this SDK ignores `beforeSendTransaction`. Don't set `dataCollection` (even `{}` turns on collecting user data) or `sendDefaultPii`. After changing the SDK or its options, check what is actually sent by pointing `SENTRY_DSN` at a local endpoint and searching the requests for test values.

## Testing

### Component and unit tests

Write these in the main session, using Vitest. Prefer them over e2e tests for anything that doesn't need the real server, such as schema validation.

- **`core`:** plain function tests, with no extra setup. `core/src/tickets.test.ts` is the example to follow. Run with `bun --filter core test`.
- **`server`:** route and middleware tests with the database, session and model mocked. `server/src/routes/tickets.polish.test.ts` is the example to follow. They can't check real access rules or database behaviour, which stay in the e2e tests. Run with `bun --filter server test`.
- **`client`:** component tests using jsdom and React Testing Library (setup in `client/src/test/setup.ts`). `client/src/pages/UsersPage.test.tsx` is the example to follow. The rules below are for these.

- **Files:** put tests next to the code they cover, as `*.test.tsx` for components and `*.test.ts` for plain functions.
- **Imports:** import `describe`, `it`, `expect` and `vi` from `vitest`, because globals are off.
- **Rendering:** render anything that uses TanStack Query with `renderWithQuery` (`client/src/test/render-with-query.tsx`), which gives each test a new `QueryClient`.
- **API calls:** never call the real API. Mock with `vi.spyOn(axios, 'get')`; mocks are restored after each test.
- **Queries:** prefer `getByRole`, then `getByLabelText` and `getByText`. Use `findBy*` for content that appears after loading.
- **Coverage:** test what the user sees in each state: loading, loaded, empty and error. Don't test shadcn components or library behaviour.
- **Boundaries:** access rules and full user flows need the real server, so they belong in the e2e tests.
- **Running:** use `bun --filter client test`. Plain `bun test` starts Bun's own runner instead of Vitest.

### End-to-end tests

Only keep an end-to-end test if it is absolutely necessary: it checks functionality that unit and component tests cannot, because it needs the real server, database or browser session (such as access rules, persistence, or database constraints), and no unit or component test already covers it. Anything else belongs in a unit or component test.

Use the `e2e-test-writer` subagent whenever end-to-end tests need to be added, updated, fixed or run. Don't write Playwright tests in the main session. Tell the subagent which feature or behaviour to cover, and what changed if it relates to recent work. The subagent starts without this conversation's context.

The subagent's setup and rules are in `.claude/agents/e2e-test-writer.md`. It does not commit, change application code or invent user accounts, so it reports any bugs it finds or logins it needs. Act on that report: relay failures to the user and get any missing email and password from them.

`e2e/global-setup.ts` seeds the admin with `seed.ts` and a test agent with `server/prisma/seed-e2e.ts` (`AGENT_EMAIL` and `AGENT_PASSWORD` in `server/.env.test`). `seed-e2e.ts` is test-only and must not run at deployment.

## Documentation

Use Context7 to fetch up-to-date documentation for libraries and tools (Bun, Express, React, Vite, Prisma, etc.) before writing code that depends on them.

## Source of truth

- `project-scope.md`: problem, features, ticket statuses and categories, user roles.
- `tech-stack.md`: chosen technologies. Follow it rather than introducing alternatives.

## Domain rules

- A ticket has exactly one status: Open, Resolved, or Closed. Internally it can also be `new` or `processing` (see Ticket states).
- A ticket has exactly one category: General Question, Technical Question, or Refund Request.
- The system ships with one admin account created at deployment. Only the admin creates and manages agents; agents view and manage tickets.
- Tickets are created from inbound support emails (via SendGrid or Mailgun inbound webhooks) or the public contact form. The people sending tickets are students.

## Stack decisions to respect

- Authentication uses database-backed sessions (stored in PostgreSQL), not JWTs.
- Backend is Express + TypeScript with Prisma; frontend is React + TypeScript + Tailwind + shadcn/ui + React Router. Use shadcn components and theme tokens (such as `text-muted-foreground`) rather than raw elements and fixed Tailwind colours.
- Client API calls use axios inside TanStack Query (`useQuery`, and `useMutation` for writes), not `fetch` or `useEffect`. Authentication is the exception and goes through `authClient`.
- All client forms use React Hook Form (`useForm`, `Controller`) with a Zod schema through `zodResolver`, not hand-written state or validation. See `client/src/components/CreateUserForm.tsx`.
- Define Zod schemas in the `core` package and import them in both client and server, rather than defining them in either one, so both validate with the same rules. See `core/src/users.ts`, used by `CreateUserForm.tsx` and `server/src/routes/users.ts`.
- AI suggested replies use the Claude API. Ticket classification, auto-resolve answers, summaries and reply polishing are the exceptions and use OpenAI `gpt-5-nano` through the Vercel AI SDK. `POST /api/tickets/:id/summary` (`server/src/lib/summarize-ticket.ts`) generates a new summary on every request and never saves it; it sends the thread as JSON (`core/src/ticket-summary.ts`), because students' text is untrusted, and it needs the same API key and has its own rate limit of the same size. For polishing, `POST /api/tickets/:id/replies/polish` uses OpenAI `gpt-5-nano` through the Vercel AI SDK (`server/src/lib/polish-reply.ts`). The model returns the greeting, message and sign-off separately, and `formatPolishedReply` (`core/src/polished-reply.ts`) removes any greeting or sign-off left in the message and adds the ticket sender's first name and the signed-in user's name, so a name from an email never reaches the model. It needs `OPENAI_API_KEY` in `server/.env` and returns 503 without it. It is limited to 10 requests per minute per user in every environment, using in-memory counters (`server/src/middleware/rate-limit-per-user.ts`), and returns 429 over that.
