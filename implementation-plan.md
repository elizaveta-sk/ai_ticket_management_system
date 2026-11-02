# Implementation Plan

## Phase 1: Project Setup

- [x] Initialize monorepo structure (`/client`, `/server`)
- [x] Set up Express server with TypeScript
- [x] Set up React app with TypeScript
- [x] Set up PostgreSQL database

## Phase 2: Authentication

- [x] Create login page
- [x] Implement login API endpoint
- [x] Implement session-based authentication middleware
- [x] Implement logout API endpoint
- [x] Add route protection on the frontend (redirect to login if unauthenticated)

## Phase 3: User Management

- [X] Create user management page (admin only)
- [x] Implement create agent API endpoint
- [x] Implement list users API endpoint
- [x] Implement edit user API endpoint
- [x] Implement delete user API endpoint
- [x] Add role-based access control (admin vs agent)

## Phase 4: Ticket CRUD

- [ ] Implement create ticket API endpoint
- [x] Implement list tickets API endpoint (with filtering by status and category, sorting)
- [x] Implement get ticket API endpoint
- [x] Implement update ticket API endpoint (change status, assign agent)
- [x] Create ticket list page with filtering and sorting
- [x] Create ticket detail page
- [x] Add ticket replies (reply thread and reply form on the ticket detail page)

## Phase 5: AI Features

- [x] Set up ChatGPT API integration
- [x] Implement auto-classification (categorize incoming tickets in the background, using OpenAI `gpt-5-nano` through the AI SDK)
- [x] Retry missed classifications with a recurring sweep of recent uncategorized tickets
- [x] Implement AI summary endpoint (generate ticket summary, using OpenAI `gpt-5-nano` through the AI SDK)
- [ ] Implement AI suggested reply endpoint
- [x] Add a Polish button that improves an agent's draft reply (OpenAI `gpt-5-nano` through the AI SDK)
- [x] Build knowledge base structure and seed with initial content
- [x] Auto-resolve tickets on arrival from the knowledge base (OpenAI `gpt-5-nano` through the AI SDK)
- [ ] Integrate AI features into ticket detail page UI

## Phase 6: Email Integration

- [ ] Set up email provider (SendGrid account: domain authentication and API key)
- [x] Implement inbound email webhook to create tickets
- [ ] Map SendGrid Inbound Parse to the inbound email webhook
- [x] Implement outbound email sending when an agent replies
- [ ] Handle email threading (replies linked to existing tickets)

## Phase 7: Dashboard

- [x] Create dashboard page with ticket stats (total, open, resolved by AI and average resolution time)
- [ ] Add tickets by category breakdown
- [ ] Add recent tickets list
- [ ] Add quick filters to navigate to filtered ticket list

## Phase 8: Polish & Deployment

- [ ] Add input validation and error handling across all endpoints
- [ ] Add loading states and error states on the frontend
- [ ] Write Dockerfile for server and client
- [ ] Set up Docker Compose for local development
- [ ] Write deployment configuration
