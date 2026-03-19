import type { FastifyPluginAsync } from "fastify";
import { createChatService } from "./service.ts";
import { ChatRequestSchema } from "./types.ts";

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  const chatService = createChatService();

  fastify.post(
    "/",
    {
      schema: {
        body: ChatRequestSchema,
      },
      sse: true,
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
            if (event.type === "tool-call" || event.type === "tool-result") {
              continue;
            }
            yield { data: event };
          }
        })(),
      );
    },
  );
};

export default chatRoutes;
