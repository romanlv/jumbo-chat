---
description: Backend conventions for this project.
globs: "*.ts, *.tsx, *.js, *.jsx, package.json"
alwaysApply: false
---

## Runtime & Package Manager

- **Bun** is the runtime and package manager. Use `bun` for everything.
- Bun automatically loads `.env` — do not use dotenv.

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
└── features/         # Feature modules (routes + services per feature)
```

## Commands

- `bun run dev` — watch mode
- `bun run start` — production
- `bun run typecheck` — TypeScript check
- `bun run check` — Biome lint + format
- `bun test` — run tests

## Conventions

- Use `@sinclair/typebox` for request/response schemas.
- Feature routes are Fastify plugins registered via `fastify.register()`.
- SSE endpoints use async generators.
- Custom errors extend `AppError` from `src/lib/errors.ts`.
- Biome for linting and formatting (not ESLint/Prettier).

## Ports

- Backend: `4089`
- Frontend: `4088`
