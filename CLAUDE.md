# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Bun is the runtime and package manager (Bun workspaces: `client`, `server`, `core`). Run from the repo root:

- `bun install`: install dependencies for all workspaces
- `bun --filter server db:migrate`: create/apply a Prisma migration after editing `server/prisma/schema.prisma`
- `bun --filter server db:generate`: regenerate the Prisma client (also runs on `bun install`)
- `bun --filter server db:seed`: create or update the admin user from `ADMIN_EMAIL` and `ADMIN_PASSWORD`
- `bun --filter server db:studio`: open Prisma Studio
- `bun run db:up` / `bun run db:down`: optional PostgreSQL in Docker (`docker-compose.yml`)
- `bun run dev`: run client (Vite, http://localhost:5173) and server (http://localhost:3000) together
- `bun run build`: build the client
- `bun --filter server typecheck`: typecheck the server
- `bun --filter client lint`: lint the client (oxlint)
- `bun --filter client test`: run the client component tests (Vitest and React Testing Library)
- `bun --filter core test`: run the `core` unit tests (Vitest)
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

## Inbound email

No email provider is set up yet. `POST /api/webhooks/inbound-email` (`server/src/routes/webhooks.ts`) takes a provider-neutral JSON body, validated by `inboundEmailSchema` in `core/src/tickets.ts`, and creates a ticket with status `open` and no category (`category` is null until the ticket is classified). `fromName` is required, so an email without one gets a 400. When a provider is chosen, map its webhook format to that schema and replace the secret check with its signature check.

- **Authentication:** the request must send `INBOUND_EMAIL_SECRET` in the `x-webhook-secret` header (`server/src/middleware/require-webhook-secret.ts`). If the secret is missing or is a placeholder, the endpoint returns 503 rather than accepting anything.
- **Duplicates:** `messageId` is unique, so a repeated delivery returns 200 with the existing ticket instead of creating another.
- **Mounting:** the router stays before `express.json()` in `app.ts` because it sets its own 1mb body limit.

## Testing

### Component and unit tests

Write these in the main session, using Vitest. Prefer them over e2e tests for anything that doesn't need the real server, such as schema validation.

- **`core`:** plain function tests, with no extra setup. `core/src/tickets.test.ts` is the example to follow. Run with `bun --filter core test`.
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

Use the `e2e-test-writer` subagent whenever end-to-end tests need to be added, updated, fixed or run. Don't write Playwright tests in the main session. Tell the subagent which feature or behaviour to cover, and what changed if it relates to recent work. The subagent starts without this conversation's context.

The subagent's setup and rules are in `.claude/agents/e2e-test-writer.md`. It does not commit, change application code or invent user accounts, so it reports any bugs it finds or logins it needs. Act on that report: relay failures to the user and get any missing email and password from them.

`e2e/global-setup.ts` seeds the admin with `seed.ts` and a test agent with `server/prisma/seed-e2e.ts` (`AGENT_EMAIL` and `AGENT_PASSWORD` in `server/.env.test`). `seed-e2e.ts` is test-only and must not run at deployment.

## Documentation

Use Context7 to fetch up-to-date documentation for libraries and tools (Bun, Express, React, Vite, Prisma, etc.) before writing code that depends on them.

## Source of truth

- `project-scope.md`: problem, features, ticket statuses and categories, user roles.
- `tech-stack.md`: chosen technologies. Follow it rather than introducing alternatives.

## Domain rules

- A ticket has exactly one status: Open, Resolved, or Closed.
- A ticket has exactly one category: General Question, Technical Question, or Refund Request.
- The system ships with one admin account created at deployment. Only the admin creates and manages agents; agents view and manage tickets.
- Tickets are created from inbound support emails (via SendGrid or Mailgun inbound webhooks). The people sending tickets are students.

## Stack decisions to respect

- Authentication uses database-backed sessions (stored in PostgreSQL), not JWTs.
- Backend is Express + TypeScript with Prisma; frontend is React + TypeScript + Tailwind + shadcn/ui + React Router. Use shadcn components and theme tokens (such as `text-muted-foreground`) rather than raw elements and fixed Tailwind colours.
- Client API calls use axios inside TanStack Query (`useQuery`, and `useMutation` for writes), not `fetch` or `useEffect`. Authentication is the exception and goes through `authClient`.
- All client forms use React Hook Form (`useForm`, `Controller`) with a Zod schema through `zodResolver`, not hand-written state or validation. See `client/src/components/CreateUserForm.tsx`.
- Define Zod schemas in the `core` package and import them in both client and server, rather than defining them in either one, so both validate with the same rules. See `core/src/users.ts`, used by `CreateUserForm.tsx` and `server/src/routes/users.ts`.
- AI features (classification, summaries, suggested replies) use the Claude API.
