import { useCallback, useRef, useState } from "react";
import type { ChatMessage, SSEEvent } from "./types";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4089";

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEscalated, setIsEscalated] = useState(false);
  const [escalationReason, setEscalationReason] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading || isEscalated) return;

      setError(null);
      setIsLoading(true);

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
      };

      const assistantId = crypto.randomUUID();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`${BACKEND_URL}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ message: text, sessionId }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data: ")) continue;

            const json = line.slice(6);
            let event: SSEEvent;
            try {
              event = JSON.parse(json);
            } catch {
              continue;
            }

            switch (event.type) {
              case "text-delta":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + event.delta }
                      : m,
                  ),
                );
                break;

              case "metadata":
                setSessionId(event.sessionId);
                if (event.escalated) {
                  setIsEscalated(true);
                  setEscalationReason(event.reason);
                }
                if (event.sources.length > 0) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, sources: event.sources }
                        : m,
                    ),
                  );
                }
                break;

              case "error":
                setError(event.message);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, isStreaming: false } : m,
                  ),
                );
                setIsLoading(false);
                return;

              case "done":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, isStreaming: false } : m,
                  ),
                );
                setIsLoading(false);
                break;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "Something went wrong";
        setError(message);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m,
          ),
        );
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [isLoading, isEscalated, sessionId],
  );

  const resetChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setSessionId(null);
    setIsLoading(false);
    setIsEscalated(false);
    setEscalationReason(undefined);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    isEscalated,
    escalationReason,
    error,
    sendMessage,
    resetChat,
  };
}
