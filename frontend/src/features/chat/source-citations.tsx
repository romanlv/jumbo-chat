import { ExternalLink } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ChatSource } from "./types";

interface SourceCitationsProps {
  sources: ChatSource[];
}

export function SourceCitations({ sources }: SourceCitationsProps) {
  if (sources.length === 0) return null;

  const unique = sources.filter(
    (s, i, arr) => arr.findIndex((o) => o.sourceUrl === s.sourceUrl) === i,
  );

  return (
    <Collapsible className="mt-2">
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        <ExternalLink className="size-3" />
        <span>
          {unique.length} source{unique.length !== 1 && "s"}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 space-y-1">
          {unique.map((source) => (
            <li key={source.sourceUrl}>
              <a
                href={source.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink className="size-3 shrink-0" />
                {source.title}
              </a>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
