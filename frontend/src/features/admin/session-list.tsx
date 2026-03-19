import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AdminSession } from "./types";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 font-medium capitalize",
        status === "escalated" && "bg-amber-100 text-amber-800",
        status === "active" && "bg-green-100 text-green-800",
        status === "resolved" && "bg-gray-100 text-gray-600",
      )}
      style={{ fontSize: 10, lineHeight: "18px" }}
    >
      <span
        className={cn(
          "rounded-full",
          status === "escalated" && "bg-amber-500",
          status === "active" && "bg-green-500",
          status === "resolved" && "bg-gray-400",
        )}
        style={{ width: 4, height: 4 }}
      />
      {status}
    </span>
  );
}

const lineClampStyle: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 1,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

interface SessionListProps {
  sessions: AdminSession[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
  isLoading: boolean;
}

export function SessionList({
  sessions,
  selectedId,
  onSelect,
  page,
  totalPages,
  hasNextPage,
  hasPrevPage,
  onNextPage,
  onPrevPage,
  isLoading,
}: SessionListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-0.5 p-1.5">
        {Array.from({ length: 8 }).map((_, i) => {
          const key = `skeleton-${String(i)}`;
          return (
            <div
              key={key}
              className="animate-pulse rounded-md bg-muted/50"
              style={{ height: 44 }}
            />
          );
        })}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p style={{ fontSize: 12 }} className="text-muted-foreground">
          No sessions found
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-1 py-0.5">
        {sessions.map((session) => {
          const isSelected = selectedId === session.id;
          const preview =
            session.status === "escalated" && session.escalatedReason
              ? session.escalatedReason
              : session.lastMessage?.slice(0, 80) || "No messages yet";

          return (
            <button
              type="button"
              key={session.id}
              onClick={() => onSelect(session.id)}
              className={cn(
                "mb-px w-full rounded-md px-2 py-1.5 text-left transition-colors",
                isSelected ? "bg-muted" : "hover:bg-muted/40",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <StatusBadge status={session.status} />
                <span
                  className="tabular-nums text-muted-foreground/50"
                  style={{ fontSize: 10 }}
                >
                  {timeAgo(session.updatedAt)}
                </span>
              </div>
              <p
                className="mt-0.5 text-muted-foreground"
                style={{ fontSize: 11, lineHeight: "15px", ...lineClampStyle }}
              >
                {preview}
              </p>
              <p
                className="mt-px tabular-nums text-muted-foreground/40"
                style={{ fontSize: 10 }}
              >
                {session.messageCount} msg · {session.id.slice(0, 8)}
              </p>
            </button>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-2 py-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onPrevPage}
            disabled={!hasPrevPage}
          >
            <ChevronLeft className="size-3" />
          </Button>
          <span
            className="tabular-nums text-muted-foreground"
            style={{ fontSize: 10 }}
          >
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onNextPage}
            disabled={!hasNextPage}
          >
            <ChevronRight className="size-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
