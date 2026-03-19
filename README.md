# Jumbo88 AI Support Chat

AI-powered support chatbot for Jumbo88 that answers questions using public website content. Uses retrieval-augmented generation (RAG) via LLM tool calls, streams responses over SSE, and escalates to a human when the bot can't help.

**Live demo:** https://frontend-production-886c.up.railway.app/

## Architecture

```
React Chat UI ──► Fastify API ──► Claude (LLM)
                                    ├─► search_knowledge_base → libSQL vector DB
                                    └─► escalate_to_human → flag session

Ingestion Pipeline (offline):
  Firecrawl → Markdown snapshots → Chunk → Embed → libSQL
```

Retrieval is an LLM tool call, not a preprocessing step. The model decides when and what to search, can reformulate queries, and naturally judges whether results are relevant enough to answer or should escalate.

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime & package manager | Bun |
| Backend | Fastify 5, Vercel AI SDK, Drizzle ORM |
| Frontend | React 19, Vite, Tailwind CSS, shadcn/ui |
| Database | libSQL (local SQLite file — no external deps) |
| LLM | Claude via `@ai-sdk/anthropic` |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dim) |
| Linting & formatting | Biome |

## Running Locally

### Prerequisites

- [Bun](https://bun.sh) installed
- Environment variables (see below)

### Setup

```bash
# Install dependencies for both backend and frontend
cd backend && bun install
cd ../frontend && bun install

# Run database migrations
cd ../backend && bun run db:migrate

# Index the knowledge base (uses checked-in markdown snapshots — no API keys needed)
bun run ingest
```

### Environment Variables

```bash
cp backend/.env.example backend/.env
# Fill in your API keys
```

`ANTHROPIC_API_KEY` is the standard way to authenticate. `ANTHROPIC_AUTH_TOKEN` is a development-only alternative that uses a Claude Max subscription OAuth token — the code includes a workaround that presents requests as a Claude Code chat session to make this work. Do not use in production. To get the token, run `claude setup-token` — it will print the current OAuth token.

The model defaults to Claude Sonnet 4.6 for reasoning. Other Claude models can be swapped in for experimentation.

When `TURSO_DATABASE_URL` is not set, the database is a local SQLite file (`local.db`) — no external database setup required.

### Start Development Servers

```bash
# Terminal 1 — Backend (port 4089)
cd backend && bun run dev

# Terminal 2 — Frontend (port 4088)
cd frontend && bun run dev
```

Open http://localhost:4088 in a browser.

## CLI

A terminal client for testing the chat API without a browser. Useful for development, debugging, prompt iteration, and agent-driven verification.

```bash
cd backend

# Single-shot — one question, streams response, exits
bun run cli "What is Jumbo88?"

# Continue a conversation
bun run cli -s <session-id> "How do refunds work?"

# Interactive REPL
bun run cli -i

# Verbosity levels
bun run cli -v "..."     # Show tool call summaries
bun run cli -vv "..."    # Show full tool call args and return values
```

Output:

```
session: abc-123
Jumbo88 is a sweepstakes platform where...

Sources:
- FAQs (https://www.jumbo88.com/faqs)
- Terms of Use (https://www.jumbo88.com/terms-of-use)
```

## Admin UI

The frontend includes an admin view at `/admin` for reviewing chat sessions — listing, filtering by status (active/escalated/resolved), and inspecting full conversation history with tool call metadata.

The admin routes are currently unprotected for development convenience. In a production system these would require authentication and an admin role.

## Evals

Lightweight product-level evaluation suite that runs through the CLI, exercising the full stack (API → chat service → LLM → vector search).

```bash
cd backend

# Run all eval cases
bun run eval

# Filter by name
bun run eval "faq-create-"
```

Eval cases are defined in `backend/evals/cases.json` (~20 cases). Each case specifies an input message, expected outcome (`answer`, `escalate`, `clarify`, or `decline`), and optionally expected source URLs. Results are saved to `backend/evals/results.json`.

## Knowledge Ingestion

```bash
cd backend

# Index only — reads checked-in markdown from data/kb/, chunks, embeds, stores
bun run ingest

# Fetch + index — scrapes URLs via Firecrawl, updates data/kb/, then indexes
bun run ingest --fetch
```

Source pages are configured in `data/sources.json`. Fetched markdown snapshots are checked into `data/kb/` so the project runs without Firecrawl credentials.

A GitHub Actions workflow (`.github/workflows/refresh-knowledge-base.yaml`) runs the fetch+index pipeline against the production database via Railway. Currently triggered manually via `workflow_dispatch`, but can be scheduled (e.g. nightly cron) to keep the knowledge base up to date automatically.

## Database

libSQL is used for both relational data (sessions, messages) and vector search (document embeddings). In development it runs as a local SQLite file — no database server to install.

```bash
cd backend

bun run db:migrate    # Apply pending migrations
bun run db:generate   # Generate new migration from schema changes
bun run db:studio     # Open Drizzle Studio web UI
```

## Tests

```bash
cd backend && bun test
```

## Project Structure

```
backend/
  src/
    features/
      chat/          # Chat service, SSE streaming, session management
      knowledge/     # Vector store, similarity search
      ingestion/     # Fetch, chunk, embed, store pipeline
      admin/         # Session list/detail/status API
    cli.ts           # CLI client
    server.ts        # Fastify setup and plugin registration
    schema.ts        # Drizzle schema (documents, sessions, messages)
  evals/             # Eval cases and runner
  data/
    sources.json     # Pages to ingest
    kb/              # Markdown snapshots of source pages

frontend/
  src/
    features/
      chat/          # Chat panel, message UI, hooks
      admin/         # Session management UI
    components/ui/   # shadcn/ui primitives
```
