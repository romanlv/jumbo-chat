import { tool } from "ai";
import { z } from "zod";
import { searchKnowledge } from "../knowledge/service.ts";
import type { ChatSource } from "./types.ts";

export interface ToolState {
  sources: ChatSource[];
  escalated: boolean;
  reason?: string;
}

interface ToolDeps {
  sessionId: string;
  state: ToolState;
  onEscalate: (reason: string) => Promise<void>;
}

export function createTools(deps: ToolDeps) {
  const { state, onEscalate } = deps;

  return {
    search_knowledge_base: tool({
      description:
        "Search the Jumbo88 knowledge base for information to answer user questions. Returns relevant content from FAQs, rules, terms, and other pages.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }) => {
        const results = await searchKnowledge(query, 5);

        for (const r of results) {
          if (r.sourceUrl.startsWith("internal://")) continue;
          const exists = state.sources.some(
            (s) => s.sourceUrl === r.sourceUrl && s.chunkIndex === r.chunkIndex,
          );
          if (!exists) {
            state.sources.push({
              sourceUrl: r.sourceUrl,
              title: r.title,
              chunkIndex: r.chunkIndex,
              score: r.score,
            });
          }
        }

        if (results.length === 0) {
          return {
            results: [],
            message: "No relevant results found in the knowledge base.",
          };
        }

        return {
          results: results.map((r) => ({
            sourceUrl: r.sourceUrl,
            title: r.title,
            content: r.content,
            score: r.score,
          })),
        };
      },
    }),

    escalate_to_human: tool({
      description:
        "Escalate the conversation to a human support agent. Use when the question is account-specific, requires human action, or no relevant knowledge base results were found.",
      inputSchema: z.object({
        reason: z
          .string()
          .describe("Why this conversation needs human attention"),
      }),
      execute: async ({ reason }) => {
        state.escalated = true;
        state.reason = reason;
        await onEscalate(reason);
        return {
          message:
            "This conversation has been escalated to a human support agent.",
          reason,
        };
      },
    }),
  };
}
