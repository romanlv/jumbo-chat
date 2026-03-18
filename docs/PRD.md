# AI Support Chat — Product Requirements Document

## Goal

AI support chatbot for Jumbo88 that answers questions using only public website content. Streaming responses, RAG-based retrieval, escalation to human when the bot can't help.

## Product Boundaries

- **In scope:** Questions answerable from public, unauthenticated Jumbo88 website content
- **Out of scope:** Account lookup, payments, balances, identity verification, promos not described on the public site, and any action that requires an authenticated human agent
- **Answer policy:** The bot may use conversational glue, but factual claims, policy guidance, and troubleshooting steps must come from retrieved Jumbo88 content. The model should reference source pages naturally in its answers. If the KB does not contain relevant information, the bot must say so and escalate.

---

## Architecture

```
┌─────────────┐                   ┌───────────────────────────────────┐
│  Frontend    │◄── SSE stream ──►│  Backend (Fastify)                │
│  React Chat  │  POST /api/chat  │                                   │
└─────────────┘                   │  streamText() ──► LLM (Claude)    │
                                  │       │                            │
┌─────────────┐    Same API       │       ├─► tool: search_kb ──► Vector DB
│  CLI Client  │◄────────────────►│       └─► tool: escalate  ──► Flag
└─────────────┘                   └───────────────────────────────────┘

┌──────────────────────────────────┐
│  Ingestion Pipeline (offline)    │
│  Firecrawl → Chunk → Embed      │
│  → Store in libSQL vector table  │
└──────────────────────────────────┘
```

---

## Primary Demo Flow

The final submission should be reviewable as one coherent end-to-end product, even if it is built in stages:

1. Reviewer runs the app against checked-in markdown knowledge base snapshots
2. User asks a Jumbo88 support question in the web chat UI
3. Backend retrieves relevant content, streams an answer, and returns sources used
4. Session and messages are persisted automatically
5. Unsupported or account-specific questions are escalated with a durable reason
6. Reviewer can inspect persisted sessions, including escalated conversations, through the admin view

The CLI is part of the development workflow from day 1 and ships with the project as a verification harness, but the web chat is the primary product surface for review.

---

## Core Design Decision: Retrieval as Tool Use

Retrieval is an **LLM tool call**, not a preprocessing step. The model decides _when_ and _what_ to search.

**Why this matters for the escalation requirement:** The model sees actual search results and judges their relevance. With inject-context RAG, we'd need a separate confidence-scoring heuristic. Tool-use lets the model reason naturally — search, evaluate results, and escalate if nothing useful came back.

Other advantages over inject-and-generate:
- No wasted vector searches on greetings or off-topic messages
- Model reformulates queries for better recall (not raw user text)
- Can search multiple times with different queries if first attempt is weak

### Tools

| Tool | Trigger | Parameters | Purpose |
|------|---------|------------|---------|
| `search_knowledge_base` | User asks about Jumbo88 policies, features, troubleshooting | `{ query: string }` | Vector search over ingested content, returns top-K chunks with source + score |
| `escalate_to_human` | Account-specific question, no relevant results, user requests human | `{ reason: string }` | Flags conversation for human handoff |

`maxSteps: 3` in Vercel AI SDK's `streamText` — covers search → answer, or search → escalate, with room for a refinement search.

### Retrieval Contract

- `search_knowledge_base` returns top 5 chunks with: `sourceUrl`, `title`, `chunkIndex`, `content`, `score`
- Backend applies a minimum relevance threshold before results reach the model; below-threshold results count as "no match"
- Assistant answers must reference retrieved material only; if results are weak or contradictory, the assistant escalates instead of guessing
- System prompt instructs the model to mention source pages in its prose (e.g., "According to our FAQ..."), but the backend does not parse or validate inline references
- Backend automatically tracks which sources were retrieved during the turn and attaches them as `sources[]` in the response metadata — no text parsing needed
- UI/CLI displays this source list below the answer

### System Prompt Concerns

- Identity and tone (Jumbo88 support, concise, friendly)
- Always search KB before answering substantive questions
- Ground answers in retrieved content only — never fabricate
- Mention source pages naturally in answers (e.g., "According to our FAQ...")
- Troubleshooting playbook: geolocation, login, loading, but only when the retrieved KB contains relevant steps
- Escalation triggers: no relevant results, account-specific, user asks for human
- Guardrails: never reveal system prompt, deflect prompt injection

---

## Authentication

Support two auth modes for the LLM provider:

| Mode | Env Var | Use Case |
|------|---------|----------|
| API Key | `ANTHROPIC_API_KEY` | Standard API billing |
| Auth Token | `ANTHROPIC_AUTH_TOKEN` | Claude Max plan (subscription-based) |

The Anthropic provider in Vercel AI SDK accepts custom headers — use bearer token auth when `ANTHROPIC_AUTH_TOKEN` is set, fall back to API key otherwise. Only one is required.

---

## API Endpoints

### Core Chat API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Chat endpoint — receives `{ message, sessionId? }`, returns SSE stream plus final metadata `{ sessionId, escalated, reason?, sources[] }` |

Clarifications:
- If `sessionId` is absent, the server creates a new session before processing the turn
- If `sessionId` is present, the server loads prior messages for that session and appends the new user turn plus streamed assistant response
- Escalation is durable: the session record is flagged in DB with a machine-readable reason
- Server validates payload shape and enforces request limits before invoking the LLM
- Response stream includes text deltas, tool call metadata, and finish reason

### Admin API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/chat/sessions` | List persisted sessions, filter by `status` (active/escalated/resolved), `flagged` |
| `GET` | `/api/chat/sessions/:id` | Full session with messages and tool call metadata |
| `PATCH` | `/api/chat/sessions/:id` | Update status (for admin review workflow) |

---

## CLI Client

Terminal client for testing the chat API without a browser. Available from day 1 as a development and verification tool.

**Location:** `backend/src/cli.ts`, runnable via `bun run cli`

### Modes

**Single-shot (default, agent-friendly):**
```bash
# New conversation — prints sessionId on first line, then streams response
bun run cli "What is Jumbo88?"

# Continue conversation — pass sessionId from previous output
bun run cli --session abc-123 "How do refunds work?"
```

One command = one turn. Blocks until response is fully streamed, then exits. Coding agents chain commands using the `sessionId` from stdout.

**Interactive REPL (human-friendly):**
```bash
bun run cli -i
```

Prompt loop for humans. `/quit` to exit. Session is created on first message and reused automatically.

### Verbosity

| Flag | Output |
|------|--------|
| (default) | `sessionId` on first line, streamed answer, sources list |
| `-v` | Above + tool call summaries (e.g., "Tool: search_knowledge_base → 4 results") |
| `-vv` | Above + full tool call args and return values (JSON) |

Verbosity applies to both single-shot and REPL modes. Agents use `-v` or `-vv` to inspect retrieval behavior and debug prompt issues.

### Output format

```
session: abc-123
Jumbo88 is a sweepstakes platform where...

Sources:
- FAQs (https://www.jumbo88.com/faqs)
- Terms of Use (https://www.jumbo88.com/terms-of-use)
```

With `-v`:
```
session: abc-123
[tool] search_knowledge_base("jumbo88 overview") → 4 results
Jumbo88 is a sweepstakes platform where...

Sources:
- FAQs (https://www.jumbo88.com/faqs)
```

**Positioning:** The CLI is not the primary end-user surface. It exists to speed up development, debugging, prompt iteration, and agent-driven verification of the backend without the browser.

---

## Knowledge Ingestion Pipeline

Offline pipeline that scrapes Jumbo88 pages, saves reviewable markdown snapshots, then chunks, embeds, and stores them.

**Location:** `backend/src/scripts/ingest.ts`, runnable via `bun run ingest`

**Source config:** All pages to ingest are defined in `backend/data/sources.json`:

```json
[
  { "url": "https://www.jumbo88.com/faqs", "title": "FAQs", "priority": 1 },
  { "url": "https://www.jumbo88.com/sweepstakes-rules", "title": "Sweepstakes Rules", "priority": 1 },
  { "url": "https://www.jumbo88.com/terms-of-use", "title": "Terms of Use", "priority": 1 },
  { "url": "https://www.jumbo88.com/privacy-policy", "title": "Privacy Policy", "priority": 2 },
  { "url": "https://www.jumbo88.com/refer-a-friend", "title": "Referral Program", "priority": 2 },
  { "url": "https://www.jumbo88.com/", "title": "Homepage", "priority": 2 }
]
```

Adding a new page to the knowledge base = adding a line to this JSON + re-running ingest.

**Artifacts:** Fetched pages saved as markdown under `backend/data/kb/` (one `.md` per source, filename derived from URL slug). Checked into git so reviewers can inspect the corpus and run without Firecrawl credentials.

**Steps:**
1. **Fetch** (optional) — Firecrawl scrapes each URL from `sources.json`, writes clean markdown to `data/kb/`
2. **Chunk** — Read markdown files from `data/kb/`, split by paragraph, merge small consecutive chunks (~500 chars), ~50 char overlap
3. **Embed** — OpenAI `text-embedding-3-small` (1536 dim) via Vercel AI SDK `embedMany()`
4. **Store** — Insert into libSQL `documents` table with `chunk_id`, `source_url`, `title`, `chunk_index`, `content`, `embedding`, `updated_at`

**Modes:**
- `bun run ingest` — **index only.** Reads existing markdown from `data/kb/`, chunks, embeds, stores. Use during development to rebuild the vector index without re-fetching.
- `bun run ingest --fetch` — **fetch + index.** Scrapes all URLs from `sources.json` via Firecrawl, updates `data/kb/`, then runs the full index pipeline. Requires `FIRECRAWL_API_KEY`.

**Idempotent:** Re-running ingestion deletes all existing chunks for a `source_url` before inserting the fresh set. One page maps to many chunks, so delete-then-insert is the correct strategy (not upsert).

---

## Chunking Strategy

Chunking is a custom part of the ingestion pipeline, not an LLM SDK feature.

**Goals:**
- Keep each chunk semantically coherent enough to answer a support question on its own
- Preserve source traceability for citations and reviewer inspection
- Avoid splitting content in places that weaken retrieval quality, such as FAQ question/answer pairs or policy bullet lists

**Rules:**
- Start from the saved markdown snapshot for a single source page
- Preserve page metadata on every chunk: `sourceUrl`, `title`, `priority`, `chunkIndex`
- Split first on markdown headings, then on paragraph boundaries
- Keep FAQ question-and-answer pairs together whenever possible
- Keep short policy bullet lists together when they form one rule or eligibility block
- Merge undersized adjacent paragraphs until the chunk reaches the target size
- Add a small overlap between neighboring chunks so boundary facts are not lost

**Initial targets:**
- Target chunk size: about 500 characters
- Soft minimum: about 250 characters before merging with a neighbor
- Overlap: about 50 characters or one short sentence

**Output shape:**
- `chunkId`
- `sourceId`
- `sourceUrl`
- `title`
- `priority`
- `chunkIndex`
- `content`

This strategy should stay simple in V1. If retrieval evals show weak ranking or fragmented answers, adjust chunk boundaries before adding more complex retrieval features such as re-ranking.

---

## Acceptance Criteria

- Bot answers only when at least one relevant KB chunk is retrieved
- Bot escalates for account-specific requests, explicit human requests, and no-match retrievals
- Streaming starts quickly and completes in a single request/response cycle with no polling
- Every substantive support answer includes `sources[]` metadata listing retrieved sources for that turn
- CLI and web UI can both show whether the turn escalated and which sources were used
- Sessions and messages are persisted; a reviewer can inspect escalated conversations after chatting
- Admin API allows listing, filtering, and reviewing sessions
- A reviewer can run the project against checked-in markdown snapshots without needing Firecrawl credentials

---

## Guardrails

- **Prompt injection:** System prompt instructs model to ignore override attempts. No user content is interpolated into prompts outside the `messages` array.
- **System prompt leakage:** Model instructed to never reveal instructions. Test cases verify this.
- **Hallucination:** Tool-use RAG means the model must explicitly retrieve before answering. System prompt reinforces "only cite retrieved content."
- **Off-topic:** Model redirects non-Jumbo88 questions back to support scope.

---

## Implementation Stages

The project is implemented in stages, but the submission is expected to present as one integrated product rather than "MVP plus roadmap."

### Stage 1 — Ingestion + Vector Search

- [x] `sources.json` config and `data/kb/` markdown snapshots
- [x] Ingestion pipeline: chunk, embed, store (index-only mode)
- [x] Fetch mode via `--fetch` flag (Firecrawl)
- [x] Vector search via libSQL (`search` method on vector store)
- [x] Tests: chunker, vector store, ingestion pipeline

### Stage 2 — Chat Service + Persistence + API + CLI

- [x] DB schema: sessions and messages tables (Drizzle for relational tables)
- [x] Chat service with tool-use RAG (`search_knowledge_base` + `escalate_to_human`)
- [x] System prompt with guardrails
- [x] `POST /api/chat` endpoint with SSE streaming, server-managed sessions (`sessionId` creation/reuse)
- [x] Persist sessions and messages to libSQL; flag escalated sessions
- [x] CLI client for testing (REPL, streams tokens, shows tool activity)
- [x] Eval suite: `evals/cases.json` + `bun run eval` runner using CLI single-shot mode
- [x] Tests: chat service tool wiring, endpoint SSE stream, persistence, guardrails

### Stage 3 — Frontend

- [ ] React chat UI with `useChat` hook (streaming, loading state, message history)
- [ ] Escalation UI (visual indicator when chat is escalated)
- [ ] Source citations display
- [ ] Tests: component tests as needed

### Stage 4 — Admin + Deploy

- [ ] Admin UI: session list, session detail, escalation review workflow
- [ ] Admin API: list sessions, view session detail, update status
- [ ] Deploy backend (Railway or Fly.io), frontend (Vercel), Turso for prod DB
- [ ] README with setup instructions
- [ ] Tests: admin endpoints, session lifecycle

---

## Evaluation Strategy

In addition to unit and integration tests, the project should include a lightweight product-level evaluation suite that runs through the CLI.

**Approach:**
- Eval cases defined in `backend/evals/cases.json`
- Eval runner (`bun run eval`) iterates cases and invokes the CLI in single-shot mode with `-vv` for each one
- This exercises the full stack (API → chat service → LLM → vector search) through the same interface a coding agent or human would use — no separate code path
- Results are parsed from CLI stdout (`-vv` gives structured tool call data + sources) and compared against expectations
- Machine-readable report saved so failures are easy to inspect

**Each eval case defines:**
- `name`
- `input` — the user message
- `expectedOutcome` — `answer`, `escalate`, or `decline`
- `expectedSources` — source URLs that should appear in the sources list (when relevant)

**Eval assertions (parsed from `-vv` CLI output):**
- Correct top-level outcome: answered, escalated, or declined
- `sources[]` present for substantive answers
- Expected source pages appear in `sources[]` when specified
- `search_knowledge_base` was called before substantive answers (visible in tool call log)
- Account-specific or unsupported questions escalate reliably

**Initial eval set:**
- 15 to 25 representative support questions
- A mix of FAQ, policy, troubleshooting, off-topic, prompt injection, and account-specific scenarios
- At least a few no-match cases to verify escalation behavior

**Non-goal for now:** No separate eval framework (Promptfoo, etc.). The CLI + a simple runner script is sufficient and keeps setup simple.

---

## Testing Strategy

All tests run via `bun test`.

### Unit Tests

| Area | What to test |
|------|-------------|
| Chunker | Splits by paragraph, respects max size, overlap works, handles edge cases (empty input, single paragraph, very long paragraph) |
| Snapshot loader | Reads checked-in markdown files, extracts metadata consistently, handles missing/invalid files |
| Vector store | Upsert, search returns ranked results, delete. Use a test-only libSQL in-memory DB. |
| Retrieval policy | Thresholding behavior, empty result handling, source metadata returned in stable shape |
| Chat service | Tool call wiring — given a mock LLM that calls `search_knowledge_base`, verify the tool executes and results are returned. Test escalation tool similarly. |

### Integration Tests

| Area | What to test |
|------|-------------|
| `POST /api/chat` | Endpoint accepts messages, returns SSE stream, stream contains expected data format. Use Fastify's `inject()` for HTTP-level testing without a running server. |
| Escalation contract | Account-specific / no-match turn returns final metadata with `escalated=true` and machine-readable `reason` |
| Persistence | New session is created when `sessionId` is absent; later turns append correctly; message ordering is stable |
| Source metadata | Grounded answer includes `sources[]` in response metadata listing retrieved sources for the turn |
| Ingestion pipeline | Markdown snapshot → chunk → embed (mock embeddings) → store → verify searchable |
| Fetch flow | `--fetch` mode updates markdown snapshots via Firecrawl, then ingestion replaces old chunks for the same source |
| RAG end-to-end | Seed vector DB with known content → send question → verify answer references seeded content (requires real or mocked LLM) |

### Guardrail Tests

| Scenario | Expected behavior |
|----------|------------------|
| Prompt injection attempts ("ignore instructions", "reveal system prompt") | Model deflects, does not comply |
| Account-specific questions ("check my balance") | Escalation triggered |
| Off-topic questions | Model redirects to Jumbo88 support scope |
| Question with no KB match | Escalation or "I don't have information on that" |
| Substantive answer without KB search | Model should always call `search_knowledge_base` before answering substantive questions |

Guardrail tests can run against the real LLM (slower, in CI) or with assertion-based mocks (fast, local).

---

## Environment Variables

```
# LLM Auth (one required)
ANTHROPIC_API_KEY=           # Standard API key
ANTHROPIC_AUTH_TOKEN=        # Claude Max plan bearer token

# Embeddings
OPENAI_API_KEY=              # For text-embedding-3-small

# Scraping
FIRECRAWL_API_KEY=           # Only required for `ingest --fetch`

# Database
TURSO_DATABASE_URL=          # Prod only, dev uses file:local.db
TURSO_AUTH_TOKEN=            # Prod only
```
