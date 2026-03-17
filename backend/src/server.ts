import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import sse from "@fastify/sse";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { type FastifyError } from "fastify";
import { config } from "./config.ts";
import { AppError } from "./lib/errors.ts";
import { fastifyLogger } from "./utils/logger.ts";

export async function buildServer() {
  const fastify = Fastify({
    logger: fastifyLogger,
    genReqId: () => randomUUID(),
  }).withTypeProvider<TypeBoxTypeProvider>();

  // --- Plugins ---
  await fastify.register(cors, {
    origin: config.frontend.url,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await fastify.register(sse);

  // --- Error handler ---
  fastify.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    const statusCode =
      error instanceof AppError
        ? error.statusCode
        : "statusCode" in error
          ? (error.statusCode ?? 500)
          : 500;

    if (statusCode >= 500) {
      request.log.error(error);
    }

    if ("validation" in error && error.validation) {
      return reply.status(400).send({
        error: "Validation Error",
        message: error.message,
      });
    }

    return reply.status(statusCode).send({
      error: error.name,
      message: error.message,
    });
  });

  // --- Routes ---
  fastify.get("/", async () => {
    return { status: "ok", name: "jumbo88-api" };
  });

  fastify.get("/health", async () => {
    return { status: "ok" };
  });

  return fastify;
}
