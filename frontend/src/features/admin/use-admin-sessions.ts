import { useCallback, useEffect, useState } from "react";
import type { AdminSession } from "./types";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4089";
const LIMIT = 20;

export function useAdminSessions() {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    "escalated",
  );
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("limit", String(LIMIT));

      const res = await fetch(
        `${BACKEND_URL}/api/admin/sessions?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();
      setSessions(data.sessions);
      setTotal(data.total);
    } catch {
      setSessions([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const changeFilter = useCallback((status: string | undefined) => {
    setStatusFilter(status);
    setPage(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    sessions,
    isLoading,
    statusFilter,
    setStatusFilter: changeFilter,
    page,
    total,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage: () => setPage((p) => Math.min(p + 1, totalPages)),
    prevPage: () => setPage((p) => Math.max(p - 1, 1)),
    refetch: fetchSessions,
  };
}
