const nodeEnv = process.env.NODE_ENV ?? "development";

export const config = {
  nodeEnv,
  isDev: nodeEnv === "development",
  isTest: nodeEnv === "test",

  server: {
    port: Number(process.env.PORT ?? 4089),
    host: process.env.HOST ?? "0.0.0.0",
  },

  frontend: {
    url: process.env.FRONTEND_URL ?? "http://localhost:4088",
  },

  db: {
    url:
      process.env.TURSO_DATABASE_URL ??
      (nodeEnv === "test" ? "file:test.db" : "file:local.db"),
    authToken: process.env.TURSO_AUTH_TOKEN,
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },

  firecrawl: {
    apiKey: process.env.FIRECRAWL_API_KEY,
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    authToken: process.env.ANTHROPIC_AUTH_TOKEN,
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
  },
};
