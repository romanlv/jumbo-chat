# AI Support Chat — Technology Research

## Project Overview

Build an AI support chatbot that answers questions using only public, unauthenticated website content (homepage, FAQ, linked pages, etc.). Key requirements: streaming responses, RAG-based retrieval, escalation logic, prompt injection guardrails.

---

## Target Website Analysis

### Pages to Ingest for RAG

| Priority | Page | Path | Notes |
|----------|------|------|-------|
| 1 | FAQs | `/faqs` | Q&A pairs — richest support source. Static HTML. |
| 1 | Rules | `/sweepstakes-rules` | Client-side rendered, but Firecrawl should handle it and save a markdown snapshot for ingestion |
| 1 | Terms of Use | `/terms-of-use` | Eligibility, purchases, refund policy |
| 2 | Privacy Policy | `/privacy-policy` | Data handling, opt-out rights |
| 2 | Referral Program | `/refer-a-friend` | Referral program details |
| 2 | Homepage | `/` | How It Works section, general positioning |
| 3 | Affiliate Terms | `/affiliates-terms-and-conditions` | Only if chatbot serves affiliate partners |

**Technical note:** Target site is built with Next.js. Most pages return content via static fetch, but some pages require JS rendering.

---

## Technology Decisions

### LLM Provider: Configurable via Vercel AI SDK (default: Claude Sonnet 4.6)

- **Why Vercel AI SDK:** Official Fastify integration (`streamText` + `toUIMessageStream`), `useChat()` React hook handles streaming/message state/loading out of the box, provider-agnostic — swap providers with one line
- **Default model:** Claude Sonnet 4 (`claude-sonnet-4-6-20250620`) via `@ai-sdk/anthropic`
- **Configurable:** Model selection via env var (e.g. `AI_PROVIDER=anthropic`, `AI_MODEL=claude-sonnet-4-6-20250620`). Easy to swap to OpenAI, Google, etc.
- **Packages:** `ai`, `@ai-sdk/anthropic` (backend), `@ai-sdk/react` (frontend). Install `@ai-sdk/openai` or others as needed.

### Embeddings: OpenAI text-embedding-3-small

- 1536 dimensions, $0.02/1M tokens
- Separate provider from the chat model, but still a low-friction default for a take-home
- Vercel AI SDK has `embed()` / `embedMany()` built in

### Vector Database: libSQL (local) / Turso (prod)

**Why libSQL over alternatives:**

| Option | Verdict |
|--------|---------|
| In-memory cosine similarity | Too simple — no persistence, doesn't show engineering depth |
| Pinecone / Qdrant cloud | Overkill for a take-home, extra signup/config |
| sqlite-vec (extension) | Requires extension loading, macOS needs custom SQLite path |
| **libSQL (native vectors)** | Built-in vector support, zero extensions, `file:local.db` dev / Turso prod |

**How it works:**
- Column type: `F32_BLOB(1536)` for float32 vectors
- ANN index: `CREATE INDEX idx ON docs(libsql_vector_idx(embedding))`
- Insert: `INSERT INTO docs (content, embedding) VALUES (?, vector32(?))`
- Search: `SELECT ... FROM vector_top_k('idx', vector32(?), 5) AS v JOIN docs d ON d.rowid = v.id`
- Distance: `vector_distance_cos(a, b)`

**Turso free tier:** 5 GB storage, 500M reads/mo, 100 databases — more than enough.

**Migration path to Postgres + pgvector:** Abstract vector operations behind a `VectorStore` interface:

```typescript
interface VectorStore {
  upsert(id: string, embedding: number[], metadata: Record<string, unknown>): Promise<void>;
  search(embedding: number[], topK: number): Promise<VectorSearchResult[]>;
  delete(id: string): Promise<void>;
}
```

Implement `LibSQLVectorStore` now, swap to `PgVectorStore` later — same interface, different SQL underneath.

### ORM: Drizzle (relational) + raw SQL (vectors)

**Why not Prisma:**

| Issue | Detail |
|-------|--------|
| Bun compatibility | Default SQLite driver uses `better-sqlite3` (Node native bindings) — doesn't work in Bun. Requires `@prisma/adapter-libsql` |
| Turso support | Still "Early Access" after 2+ years. `prisma migrate dev` doesn't fully work |
| Vector columns | No native vector type. `Unsupported("F32_BLOB(1536)")` — can't read/write through Prisma CRUD |
| Bundle size | ~1.6 MB gzipped vs Drizzle's ~12 KB |

**Why Drizzle:**
- First-class libSQL/Turso support, migrations work natively
- Bun works without adapters
- Can define vector columns via `customType()` (known bug #3899 with inserts — use raw SQL for vector ops)
- 130x smaller bundle than Prisma

**Approach:** Use Drizzle for relational tables (sessions, messages). Use raw `@libsql/client` queries for all vector operations (insert, search). Neither ORM handles `vector_top_k()` well.

### Web Scraping: Firecrawl

- Handles JS-rendered pages out of the box (no Playwright/Puppeteer needed)
- Returns clean markdown optimized for LLM consumption
- Lets us save one markdown snapshot per source page for a reviewable, deterministic corpus
- Can crawl linked pages automatically from a starting URL
- Eliminates the need for separate tools for static vs client-side rendered pages
- **Package:** `@mendable/firecrawl-js`
- **Free tier:** 500 credits/mo (1 credit per page) — sufficient for ingesting a handful of pages

**Recommended exercise workflow:**
- Check in the fetched markdown snapshots under `backend/data/kb/`
- Run ingestion against local markdown by default
- Use Firecrawl only for an explicit refresh step so reviewers do not need network access or extra credentials

### Text Chunking: Custom splitter (~40 lines)

- Split by paragraph (`\n\n`), then by sentence if too large
- Merge small consecutive chunks up to `maxChunkSize` (~500 chars)
- ~50 char overlap between chunks
- Zero dependencies, shows understanding

### Streaming: SSE via Vercel AI SDK

- **Backend:** `streamText()` → `toUIMessageStream()` pipes SSE to Fastify response
- **Frontend:** `useChat()` hook consumes SSE, manages message state, provides `isLoading`/`error`
- Simpler than WebSockets, one-way stream is all chat needs

---

## Final Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Bun |
| Frontend | React + Vite + shadcn/ui + Tailwind |
| Backend | Fastify |
| LLM | Claude Sonnet 4.6 via Vercel AI SDK (configurable) |
| Embeddings | OpenAI text-embedding-3-small (1536 dim) |
| Vector DB | libSQL local / Turso prod |
| ORM | Drizzle (relational) + raw SQL (vectors) |
| Scraping | Firecrawl refresh + checked-in markdown snapshots |
| Chunking | Custom paragraph/sentence splitter |
| Streaming | SSE via Vercel AI SDK |
| Deploy | Vercel (frontend) + Railway or Fly.io (backend) |

### Packages to Add

**Backend:**
- `ai` — Vercel AI SDK core
- `@ai-sdk/anthropic` — Anthropic provider (default)
- `@libsql/client` — libSQL/Turso client
- `drizzle-orm` — ORM for relational tables
- `@mendable/firecrawl-js` — web scraping with JS rendering + markdown output

**Frontend:**
- `@ai-sdk/react` — `useChat()` hook for streaming UI

### Environment Variables

```
ANTHROPIC_API_KEY=
AI_MODEL=claude-sonnet-4-6-20250620  # configurable: any Vercel AI SDK compatible model
OPENAI_API_KEY=
FIRECRAWL_API_KEY=          # only needed for refresh
TURSO_DATABASE_URL=     # prod only, use file:local.db in dev
TURSO_AUTH_TOKEN=        # prod only
```
