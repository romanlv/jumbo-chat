# Implementation Notes

Design decisions and trade-offs made for this prototype, along with notes on what a production system would look like.

## Database — libSQL (via Turso)

[libSQL](https://github.com/tursodatabase/libsql) (a fork of SQLite) was chosen to keep the prototype simple and runnable locally without external dependencies. It also has native support for vector search, which the app relies on.

I also wanted to experiment with [Turso](https://turso.tech/) (cloud-hosted libSQL) — it worked great for the deployed version.

**Production alternative:** PostgreSQL with the pgvector extension for vector search.

## ORM — Drizzle

Drizzle was chosen because it works well with SQLite. Normally I'd use Prisma, but for this use case Drizzle is flexible enough and a lighter fit. I may use it in future projects as well.

## Deployment — Railway

The app is deployed on Railway with three basic services.

**Production alternative:** Use a CDN for static assets (S3 or Cloudflare), proper infrastructure separation.

## Authentication

The prototype has no authentication. A real product would need auth for the admin panel and to associate questions with user accounts.

## LLM — Claude (reasoning model)

The choice of Claude's reasoning model was primarily to use my existing subscription and avoid extra costs for the prototype.

**Production alternative:** Experiment with other models — OpenAI (to simplify dependencies) or Google Gemini. Would benchmark quality and cost.

## Knowledge Base Sources

The sweepstakes rules URL on the Jumbo site requires an authenticated user session, so the content was saved as a static markdown file in the KB sources instead of being fetched live. It's unclear whether this is intentional access control or a bug on the site.

## Future Improvements

- **User feedback on chat responses** — Add thumbs up/down buttons on each answer (similar to Claude's chat UI), optionally with a text input for details. This would help collect signal from real users on answer quality and identify gaps in the knowledge base.

- **Embedding model** — The prototype uses OpenAI's `text-embedding-3-small`. Worth experimenting with Voyage AI (`voyage-3`) or Google Gemini embeddings (`gemini-embedding-001`) — both score higher on retrieval benchmarks. Gemini embeddings are free via API, making them attractive for cost. Voyage AI is particularly strong for technical/code content. Either could improve retrieval quality without changing the overall architecture.

## Testing

The backend has unit tests; the frontend does not. In a real project, I'd have tests on both sides. This was kept lightweight given the prototype scope.
