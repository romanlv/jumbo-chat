import type { FastifyPluginAsync } from "fastify";
import { getDb } from "../../lib/db.ts";
import { LibSQLVectorStore } from "../knowledge/vector-store.ts";
import { createChatService } from "./service.ts";
import { ChatRequestSchema } from "./types.ts";

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  const vectorStore = new LibSQLVectorStore(getDb());

  const chatService = createChatService({ vectorStore });

  fastify.post(
    "/",
    {
      schema: {
        body: ChatRequestSchema,
      },
    },
    async (request, reply) => {
      const { message, sessionId } = request.body as {
        message: string;
        sessionId?: string;
      };

      const session = await chatService.getOrCreateSession(sessionId);
      const events = chatService.processMessage(session.id, message);

      return reply.sse.send(
        (async function* () {
          for await (const event of events) {
            yield { data: JSON.stringify(event) };
          }
        })(),
      );
    },
  );
};

export default chatRoutes;
