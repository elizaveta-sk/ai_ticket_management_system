# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Bun is the runtime and package manager (Bun workspaces: `client`, `server`). Run from the repo root:

- `bun install`: install dependencies for all workspaces
- `bun run db:up` / `bun run db:down`: start/stop PostgreSQL in Docker (`docker-compose.yml`)
- `bun run dev`: run client (Vite, http://localhost:5173) and server (http://localhost:3000) together
- `bun run build`: build the client
- `bun --filter server typecheck`: typecheck the server
- `bun --filter client lint`: lint the client (oxlint)

The server reads `server/.env` (copy from `server/.env.example`).

## Architecture

- `client/`: React + TypeScript (Vite). The Vite dev server proxies `/api/*` to the Express server, so the client calls relative `/api` URLs.
- `server/`: Express + TypeScript, run directly by Bun (no build step). `src/app.ts` defines the app and routes; `src/index.ts` starts the listener. Database access currently uses Bun's built-in `sql` client; Prisma is planned.
- `implementation-plan.md` tracks progress as a phase-by-phase checklist.

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
- Backend is Express + TypeScript with Prisma; frontend is React + TypeScript + Tailwind + React Router.
- AI features (classification, summaries, suggested replies) use the Claude API.
