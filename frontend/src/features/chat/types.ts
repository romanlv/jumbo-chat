export interface ChatSource {
  sourceUrl: string;
  title: string;
  chunkIndex: number;
  score: number;
}

export type SSEEvent =
  | { type: "text-delta"; delta: string }
  | { type: "tool-call"; name: string; args: Record<string, unknown> }
  | { type: "tool-result"; name: string; result: unknown }
  | {
      type: "metadata";
      sessionId: string;
      escalated: boolean;
      reason?: string;
      sources: ChatSource[];
    }
  | { type: "done" };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  isStreaming?: boolean;
}
