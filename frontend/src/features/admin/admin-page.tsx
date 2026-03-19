import { ArrowLeft, Inbox } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SessionDetailView } from "./session-detail";
import { SessionList } from "./session-list";
import { useAdminSessions } from "./use-admin-sessions";
import { useSessionDetail } from "./use-session-detail";

const FILTERS = [
  { label: "All", value: undefined },
  { label: "Escalated", value: "escalated" },
  { label: "Active", value: "active" },
  { label: "Resolved", value: "resolved" },
] as const;

export function AdminPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const {
    sessions,
    isLoading,
    statusFilter,
    setStatusFilter,
    page,
    total,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    refetch,
  } = useAdminSessions();
  const {
    session: detail,
    isLoading: detailLoading,
    refetch: refetchDetail,
  } = useSessionDetail(selectedId);

  function handleStatusUpdated() {
    refetch();
    refetchDetail();
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-border px-5 py-3">
        <Link to="/">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold">Sessions</h1>
          {!isLoading && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              {total}
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — filters + list scroll independently */}
        <div
          className="flex shrink-0 flex-col border-r border-border"
          style={{ width: 288 }}
        >
          <div className="flex items-center gap-1 border-b border-border px-3 py-2">
            {FILTERS.map((f) => (
              <button
                type="button"
                key={f.label}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  statusFilter === f.value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <SessionList
            sessions={sessions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            page={page}
            totalPages={totalPages}
            hasNextPage={hasNextPage}
            hasPrevPage={hasPrevPage}
            onNextPage={nextPage}
            onPrevPage={prevPage}
            isLoading={isLoading}
          />
        </div>

        {/* Detail panel */}
        <div className="flex flex-1 flex-col">
          {detail ? (
            <SessionDetailView
              session={detail}
              isLoading={detailLoading}
              onStatusUpdated={handleStatusUpdated}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Inbox className="size-5 text-muted-foreground/30" />
              <p className="text-xs">Select a session to view</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
