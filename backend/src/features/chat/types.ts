import { type Static, Type } from "@sinclair/typebox";

export const ChatRequestSchema = Type.Object({
  message: Type.String({ minLength: 1 }),
  sessionId: Type.Optional(Type.String()),
});

export type ChatRequest = Static<typeof ChatRequestSchema>;

export interface ChatSource {
  sourceUrl: string;
  title: string;
  chunkIndex: number;
  score: number;
}

export type SSEEvent =
  | { type: "text-delta"; delta: string }
  | { type: "thinking" }
  | {
      type: "metadata";
      sessionId: string;
      escalated: boolean;
      reason?: string;
      sources: ChatSource[];
    }
  | { type: "done" };
