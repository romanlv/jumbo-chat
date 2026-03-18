import { Bot, User } from "lucide-react";
import Markdown from "react-markdown";
import { cn } from "@/lib/utils";
import { SourceCitations } from "./source-citations";
import type { ChatMessage } from "./types";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[80%] items-start gap-2">
          <div className="rounded-2xl bg-muted px-4 py-2.5 text-sm">
            {message.content}
          </div>
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <User className="size-4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="flex max-w-full items-start gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border">
          <Bot className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="prose prose-sm prose-neutral max-w-none">
            <Markdown>{message.content}</Markdown>
            {message.isStreaming && (
              <span className="ml-0.5 inline-block animate-pulse">|</span>
            )}
          </div>
          {message.sources && <SourceCitations sources={message.sources} />}
        </div>
      </div>
    </div>
  );
}

export function ThinkingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border">
          <Bot className="size-4" />
        </div>
        <div className="flex items-center gap-1 py-2">
          <span
            className={cn(
              "size-1.5 rounded-full bg-muted-foreground/50 animate-bounce",
            )}
            style={{ animationDelay: "0ms" }}
          />
          <span
            className={cn(
              "size-1.5 rounded-full bg-muted-foreground/50 animate-bounce",
            )}
            style={{ animationDelay: "150ms" }}
          />
          <span
            className={cn(
              "size-1.5 rounded-full bg-muted-foreground/50 animate-bounce",
            )}
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );
}
