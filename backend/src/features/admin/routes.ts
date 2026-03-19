import type { FastifyPluginAsync } from "fastify";
import {
  getSessionDetail,
  listSessions,
  updateSessionStatus,
} from "./service.ts";
import {
  SessionListQuerySchema,
  SessionParamsSchema,
  UpdateSessionBodySchema,
} from "./types.ts";

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/",
    { schema: { querystring: SessionListQuerySchema } },
    async (request) => {
      const { status, page, limit } = request.query as {
        status?: string;
        page?: number;
        limit?: number;
      };
      return listSessions({ status, page, limit });
    },
  );

  fastify.get(
    "/:id",
    { schema: { params: SessionParamsSchema } },
    async (request) => {
      const { id } = request.params as { id: string };
      return getSessionDetail(id);
    },
  );

  fastify.patch(
    "/:id",
    {
      schema: {
        params: SessionParamsSchema,
        body: UpdateSessionBodySchema,
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: string };
      return updateSessionStatus(id, status);
    },
  );
};

export default adminRoutes;
