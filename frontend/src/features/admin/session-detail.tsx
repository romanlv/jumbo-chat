import { AlertTriangle, Bot, CheckCircle2, User } from "lucide-react";
import Markdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SourceCitations } from "../chat/source-citations";
import type { ChatSource } from "../chat/types";
import type { SessionDetail } from "./types";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4089";

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 font-medium capitalize",
        status === "escalated" && "bg-amber-100 text-amber-800",
        status === "active" && "bg-green-100 text-green-800",
        status === "resolved" && "bg-gray-100 text-gray-600",
      )}
      style={{ fontSize: 12, lineHeight: "24px" }}
    >
      <span
        className={cn(
          "rounded-full",
          status === "escalated" && "bg-amber-500",
          status === "active" && "bg-green-500",
          status === "resolved" && "bg-gray-400",
        )}
        style={{ width: 6, height: 6 }}
      />
      {status}
    </span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface SessionDetailViewProps {
  session: SessionDetail;
  isLoading: boolean;
  onStatusUpdated: () => void;
}

export function SessionDetailView({
  session,
  isLoading,
  onStatusUpdated,
}: SessionDetailViewProps) {
  if (isLoading) {
    return (
      <div className="flex flex-1 items-start justify-center bg-muted/30 p-4">
        <div
          className="w-full animate-pulse rounded-xl border border-border bg-background"
          style={{ maxWidth: 768, height: 300 }}
        />
      </div>
    );
  }

  async function handleResolve() {
    await fetch(`${BACKEND_URL}/api/admin/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    onStatusUpdated();
  }

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 p-4">
      <div
        className="mx-auto rounded-xl border border-border bg-background px-4"
        style={{ maxWidth: 768 }}
      >
        {/* Header */}
        <div className="pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusBadge status={session.status} />
              <span className="text-muted-foreground" style={{ fontSize: 13 }}>
                <span className="font-mono">{session.id.slice(0, 8)}</span>
                {" · "}
                {formatDate(session.createdAt)}
                {" · "}
                {session.messages.length} messages
              </span>
            </div>

            {session.status === "escalated" && (
              <Button variant="outline" size="sm" onClick={handleResolve}>
                <CheckCircle2 className="size-3.5" />
                Resolve
              </Button>
            )}
          </div>

          {session.escalatedReason && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle
                className="shrink-0 text-amber-500"
                style={{ width: 14, height: 14, marginTop: 2 }}
              />
              <span>{session.escalatedReason}</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Messages */}
        <div className="space-y-4 py-6">
          {session.messages.map((msg) => {
            const sources: ChatSource[] = msg.sources
              ? JSON.parse(msg.sources)
              : [];

            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div
                    className="flex items-start gap-2"
                    style={{ maxWidth: "80%" }}
                  >
                    <div className="rounded-2xl bg-muted px-4 py-2.5 text-sm">
                      {msg.content}
                    </div>
                    <div
                      className="flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      style={{ width: 28, height: 28 }}
                    >
                      <User style={{ width: 16, height: 16 }} />
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex justify-start">
                <div
                  className="flex items-start gap-2"
                  style={{ maxWidth: "100%" }}
                >
                  <div
                    className="flex shrink-0 items-center justify-center rounded-full border border-border"
                    style={{ width: 28, height: 28 }}
                  >
                    <Bot style={{ width: 16, height: 16 }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      className="prose prose-sm prose-neutral"
                      style={{ maxWidth: "none" }}
                    >
                      <Markdown>{msg.content}</Markdown>
                    </div>
                    {sources.length > 0 && (
                      <SourceCitations sources={sources} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
