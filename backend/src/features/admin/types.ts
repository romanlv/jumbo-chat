import { type Static, Type } from "@sinclair/typebox";

export const SessionListQuerySchema = Type.Object({
  status: Type.Optional(
    Type.Union([
      Type.Literal("active"),
      Type.Literal("escalated"),
      Type.Literal("resolved"),
    ]),
  ),
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
});

export type SessionListQuery = Static<typeof SessionListQuerySchema>;

export const SessionParamsSchema = Type.Object({
  id: Type.String(),
});

export type SessionParams = Static<typeof SessionParamsSchema>;

export const UpdateSessionBodySchema = Type.Object({
  status: Type.Union([
    Type.Literal("active"),
    Type.Literal("escalated"),
    Type.Literal("resolved"),
  ]),
});

export type UpdateSessionBody = Static<typeof UpdateSessionBodySchema>;
