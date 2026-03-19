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
  | { type: "error"; message: string }
  | { type: "done" };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  isStreaming?: boolean;
}
