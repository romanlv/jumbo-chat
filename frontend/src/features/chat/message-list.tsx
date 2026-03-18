import { MessageBubble, ThinkingIndicator } from "./message-bubble";
import type { ChatMessage } from "./types";
import { useAutoScroll } from "./use-auto-scroll";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const { containerRef } = useAutoScroll<HTMLDivElement>();

  const lastMessage = messages[messages.length - 1];
  const showThinking =
    isLoading &&
    lastMessage?.role === "assistant" &&
    lastMessage.content === "";

  if (messages.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex flex-1 items-center justify-center"
      >
        <p className="text-muted-foreground text-sm">
          Send a message to start chatting
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        {messages.map((message) =>
          showThinking && message.id === lastMessage.id ? null : (
            <MessageBubble key={message.id} message={message} />
          ),
        )}
        {showThinking && <ThinkingIndicator />}
      </div>
    </div>
  );
}
