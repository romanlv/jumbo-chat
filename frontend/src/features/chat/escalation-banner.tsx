import { AlertTriangle } from "lucide-react";

interface EscalationBannerProps {
  reason?: string;
}

export function EscalationBanner({ reason }: EscalationBannerProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle className="size-4 shrink-0" />
      <span>
        {reason || "This conversation has been escalated to a human agent."}
      </span>
    </div>
  );
}
