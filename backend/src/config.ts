export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isDev: (process.env.NODE_ENV ?? "development") === "development",
  isTest: process.env.NODE_ENV === "test",

  server: {
    port: Number(process.env.PORT ?? 4089),
    host: process.env.HOST ?? "0.0.0.0",
  },

  frontend: {
    url: process.env.FRONTEND_URL ?? "http://localhost:4088",
  },
};
