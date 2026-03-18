import { afterEach, describe, expect, test } from "bun:test";
import { closeDb } from "../../db.ts";
import { buildServer } from "../../server.ts";

// Route tests using fastify.inject()
// These test HTTP-level behavior without a real LLM

describe("POST /api/chat", () => {
  afterEach(() => {
    closeDb();
  });

  test("returns 400 for missing message", async () => {
    const fastify = await buildServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/api/chat",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    await fastify.close();
  });

  test("returns 400 for empty message", async () => {
    const fastify = await buildServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "" },
    });

    expect(response.statusCode).toBe(400);
    await fastify.close();
  });
});
