import pino from "pino";
import { config } from "../config.ts";

export const logger = pino({
  level: config.isTest ? "silent" : config.isDev ? "debug" : "info",
  transport: config.isDev
    ? {
        target: "pino-pretty",
        options: { colorize: true },
      }
    : undefined,
});

export const fastifyLogger = config.isTest
  ? false
  : config.isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : true;
