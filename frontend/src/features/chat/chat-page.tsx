import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatInput } from "./chat-input";
import { EscalationBanner } from "./escalation-banner";
import { MessageList } from "./message-list";
import { useChat } from "./use-chat";

export function ChatPage() {
  const {
    messages,
    isLoading,
    isEscalated,
    escalationReason,
    error,
    sendMessage,
    resetChat,
  } = useChat();

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-sm font-semibold">Jumbo88 Support</h1>
        <Button variant="ghost" size="sm" onClick={resetChat}>
          <RotateCcw className="size-3.5" />
          New Chat
        </Button>
      </header>

      <MessageList messages={messages} isLoading={isLoading} />

      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pb-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {isEscalated && <EscalationBanner reason={escalationReason} />}
        <ChatInput
          onSend={sendMessage}
          disabled={isLoading || isEscalated}
          placeholder={isEscalated ? "Conversation escalated" : undefined}
        />
      </div>
    </div>
  );
}
