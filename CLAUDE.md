## Project Overview

Monorepo with `frontend/` and `backend/` directories.

## Ports

- Frontend: `4088`
- Backend: `4089`

## Package Manager & Runtime

- **Bun** for everything — runtime, package manager, test runner.
- Bun automatically loads `.env` — do not use dotenv.

## Code Organization

Both frontend and backend use a **feature-based** folder structure. Code is organized by domain, not by type.

### Backend: `backend/src/features/<feature>/`

Each feature is a self-contained Fastify plugin:

- `routes.ts` — Fastify route plugin, registered in `server.ts` via `fastify.register(routes, { prefix: '/api/<feature>' })`
- `service.ts` — Business logic, separated from HTTP concerns
- `routes.test.ts` / `service.test.ts` — Colocated tests

### Frontend: `frontend/src/features/<feature>/`

Flat structure — files colocated directly under the feature folder:

```
features/chat/
├── chat-panel.tsx      # may export ChatPanel, ChatPanelHeader, etc.
├── use-chat-messages.ts
├── types.ts
```

File names use **kebab-case**. Multiple related components can live in the same file.

Shared UI primitives live in `src/components/ui/` (shadcn). Shared utilities live in `src/lib/`.

## Conventions

- Keep features independent — avoid cross-feature imports. Shared logic goes in `lib/`.
- Biome for linting and formatting (not ESLint/Prettier).
- TypeBox (`@sinclair/typebox`) for backend request/response schemas.
- shadcn/ui + Tailwind CSS for frontend components.

## Testing Chat

Use the CLI to test chat responses without a browser (from `backend/`):

```bash
bun run cli "What is Jumbo88?"            # single question
bun run cli -s <session-id> "follow up"   # continue a conversation
bun run cli -i                            # interactive REPL
bun run cli -v "..."                      # show tool call summaries
bun run cli -vv "..."                     # show full tool call details
```

## Deployment & Debugging

- Hosted on **Railway**. Deploy via GitHub Actions (`workflow_dispatch`).
- Production logs: run `railway logs` from the `backend/` or `frontend/` directory (requires Railway CLI linked to the project).
- Backend uses Pino structured logging (JSON in production, pretty in dev).
