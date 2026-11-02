# AI Ticket Management System

A support desk for an online course provider. An AI agent answers the questions it can from a knowledge base, and passes everything else to a human support team on a ticket management platform.

## Try it

| What | Link |
| --- | --- |
| **Send a support request** | https://aiticketmanagement.netlify.app/contact |
| **Log in to the ticket platform** | https://aiticketmanagement.netlify.app/login |

**Test account:** `lucy_agent@example.com`, password `password123`

This is a shared demo account, so anyone can see what you enter. The hosting is on a free plan and goes to sleep when idle, so the first request after a quiet period can take up to a minute or so.

## How it works

1. **A student sends a request** through the contact form, which creates a ticket and sorts it into a category.
2. **If the knowledge base can answer it**, the AI agent, Jane, emails the answer back and marks the ticket as resolved.
3. **If it can't**, the ticket goes to the ticket platform, assigned to a support agent, who replies by hand. Refund requests always go to a person.
4. **Conversations can continue by email.** A student's reply arrives on the same ticket in the platform and reopens it if needed, and the agent can keep replying until it's resolved. Replies are always handled by a person, not the AI.

## Features

### For support agents

- **Ticket views:** the sidebar sorts tickets into Need attention (your tickets and unassigned ones), Refund requests, Resolved, Closed and All tickets, each with a live count.
- **Message panel:** clicking a ticket opens the conversation beside the list, so agents can work through tickets without changing pages.
- **Polish:** rewrites a draft reply so it's polite and every agent has the same tone of voice.
- **Summarize:** summarizes the whole conversation, for picking up a long ticket quickly.
- **Search, filters and sorting** across all tickets.
- **Ticket handling:** change a ticket's status, category and assignee. A ticket can only be closed once it's resolved.
- **Dashboard:** total and open tickets, how many the AI resolved, average resolution time, and tickets per day.

### For admins

- **Agent management:** create, edit and remove support agent accounts. This panel is for admins only, so the test account can't open it.

### Behind the scenes

- **Automatic categories:** General Question, Technical Question or Refund Request.
- **Recovery:** a background sweep picks up tickets that were interrupted, for example by a restart, so none stay hidden.
- **Safeguards on AI answers:** answers containing links are rejected, and an address can get at most 3 automatic answers in 24 hours, which limits auto-responder loops and misuse.
- **Privacy in error logs:** student details and message text are removed before anything reaches Sentry.

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query and Table |
| Backend | Bun, Express, TypeScript, Better Auth with database sessions |
| Database | PostgreSQL with Prisma |
| AI | OpenAI `gpt-5-nano` through the Vercel AI SDK |
| Email | SendGrid, for sending and for receiving replies through Inbound Parse |
| Monitoring | Sentry |
| Testing | Vitest, React Testing Library, Playwright |
| Hosting | Netlify (client), Render (server), Neon (database) |

## Deploy your own

The browser only ever talks to Netlify, which passes `/api/*` requests on to the server on Render. This keeps login cookies first-party and means the API needs no CORS setup.

You'll need accounts with [Neon](https://neon.com), [Render](https://render.com), [Netlify](https://www.netlify.com), [OpenAI](https://platform.openai.com) and [SendGrid](https://sendgrid.com), plus [Bun](https://bun.sh) on your computer. Sentry is optional.

### 1. Create the database

Create a Neon project and copy both connection strings: the pooled one, for the running server, and the direct one, for migrations and seeding. Then run these from the repository root, after `bun install`:

```bash
# Create the tables
cd server
DATABASE_URL="<direct connection string>" bunx --bun prisma migrate deploy
cd ..

# Create the Jane AI agent, which every environment needs
DATABASE_URL="<direct connection string>" bun --filter server db:seed:ai-agent

# Create your admin account
DATABASE_URL="<direct connection string>" ADMIN_EMAIL="<your email>" ADMIN_PASSWORD="<a strong password>" bun --filter server db:seed
```

Run the migration command again whenever a new migration is added.

### 2. Deploy the server on Render

Create a **Web Service** from your repository, with these settings:

| Setting | Value |
| --- | --- |
| Language | Node (Render includes Bun) |
| Root Directory | Leave empty, because the server also needs `core` and the root `bun.lock` |
| Build Command | `bun install --frozen-lockfile` |
| Start Command | `cd server && bun run start` |
| Health Check Path | `/api/health` |

Add these environment variables:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production`, which turns on login rate limiting |
| `DATABASE_URL` | The **pooled** Neon connection string |
| `BETTER_AUTH_SECRET` | Output of `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Your Netlify URL. Use a placeholder until step 4 |
| `CLIENT_URL` | Your Netlify URL, the same as above |
| `OPENAI_API_KEY` | Your OpenAI key. Without it, tickets skip the AI and go straight to agents |
| `SENDGRID_API_KEY`, `EMAIL_FROM` | See step 5. Without them, no email is sent |

Copy the URL Render gives the service, such as `https://your-service.onrender.com`.

### 3. Deploy the client on Netlify

1. In `netlify.toml`, change the `/api/*` redirect to your Render URL, keeping `/api/:splat` on the end, then commit and push.
2. Import the repository into Netlify. It reads the build settings from `netlify.toml`, so there's nothing else to enter.
3. In **Project configuration → General → Powered by Netlify badge**, turn the badge off, because it covers the buttons in the bottom-right corner.

### 4. Connect them

Set `BETTER_AUTH_URL` and `CLIENT_URL` on Render to your Netlify URL, with `https://` and nothing after the domain. Render redeploys after you save. Then log in at `/login` with your admin account, to check it all works.

### 5. Set up email

**Sending:** in SendGrid, authenticate your domain and create an API key. Then set on Render:

- `SENDGRID_API_KEY`: your API key
- `EMAIL_FROM`: an address on the authenticated domain

**Receiving replies**, so that conversations can continue by email:

1. Pick a dedicated subdomain, such as `reply.yourdomain.com`, and add an MX record pointing it to `mx.sendgrid.net`. Never use your main domain, because Inbound Parse takes over all mail for that hostname.
2. Generate a secret with `openssl rand -hex 32`.
3. In SendGrid's Inbound Parse settings, add the subdomain with this destination URL: `https://your-service.onrender.com/api/webhooks/inbound-parse/<your secret>`
4. Once that's working, set on Render:
   - `INBOUND_REPLY_DOMAIN`: the subdomain
   - `INBOUND_PARSE_SECRET`: the secret

### 6. Add your team and content

- **Agents:** log in as the admin and create them on the Users page.
- **Default agent:** tickets the AI can't resolve go to the agent whose email is `defaultAgentEmail` in `server/src/lib/ticket-state.ts`. Create an agent with that address or change it there. Without a match, tickets arrive unassigned.
- **Knowledge base:** replace the sample content in `server/knowledge-base.md` with your own. The AI reads it on every attempt, so an edit applies once it's deployed.

### 7. Optional: error monitoring

Create two Sentry projects, one for each side:

- **On Render:** `SENTRY_DSN` and `SENTRY_ENVIRONMENT=production`
- **On Netlify:** `VITE_SENTRY_DSN` and `VITE_SENTRY_ENVIRONMENT=production`, then redeploy, because Vite reads these at build time
- **On Netlify, for readable stack traces:** `SENTRY_AUTH_TOKEN`

### Limits of this setup

- Render's free plan sleeps when idle, so the first request afterwards is slow.
- Run a single server instance. Rate limits are kept in memory, and extra instances would repeat each other's background work and AI calls.

## Run it locally

You'll need Bun and PostgreSQL. `bun run db:up` starts PostgreSQL in Docker if you'd rather not install it. If you use it, make `DATABASE_URL` match the settings in `docker-compose.yml`.

```bash
bun install
cp server/.env.example server/.env   # then fill in your values
bun --filter server db:migrate
bun --filter server db:seed:ai-agent
bun --filter server db:seed
bun --filter server db:seed:tickets  # optional sample tickets
bun run dev
```

The client runs at http://localhost:5173 and the server at http://localhost:3000.

## Tests

```bash
bun --filter core test     # shared logic
bun --filter server test   # API routes, with the database and AI mocked
bun --filter client test   # components
bun run test:e2e           # end-to-end, in a real browser against a test database
```
