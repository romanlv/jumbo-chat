---
description: Backend conventions for this project.
globs: "*.ts, *.tsx, *.js, *.jsx, package.json"
alwaysApply: false
---

## Framework

- **Fastify 5** with `@fastify/type-provider-typebox` for type-safe request/response schemas.
- **@fastify/cors** for CORS.
- **@fastify/sse** for Server-Sent Events streaming.
- **Pino** for structured logging (with `pino-pretty` in development).

## Project Structure

```
src/
├── index.ts          # Entry point, server startup, graceful shutdown
├── server.ts         # Fastify instance, plugins, error handler, route registration
├── config.ts         # Environment configuration
├── utils/
│   └── logger.ts     # Pino logger setup
├── lib/
│   └── errors.ts     # Custom error classes (AppError, NotFoundError, etc.)
└── features/         # Feature modules (see root CLAUDE.md for pattern)
```

## Commands

- `bun run dev` — watch mode
- `bun run start` — production
- `bun run typecheck` — TypeScript check
- `bun run check` — Biome lint + format
- `bun test` — run tests

## Conventions

- Feature routes are Fastify plugins registered via `fastify.register()`.
- SSE endpoints use async generators.
- Custom errors extend `AppError` from `src/lib/errors.ts`.
