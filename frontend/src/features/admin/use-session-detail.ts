import { useCallback, useEffect, useState } from "react";
import type { SessionDetail } from "./types";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4089";

export function useSessionDetail(sessionId: string | null) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/sessions/${sessionId}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      setSession(await res.json());
    } catch {
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return { session, isLoading, refetch: fetchDetail };
}
