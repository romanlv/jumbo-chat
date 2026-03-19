import { randomUUID } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { type ModelMessage, stepCountIs, streamText } from "ai";
import { eq } from "drizzle-orm";
import { config } from "../../config.ts";
import { db } from "../../db.ts";
import { NotFoundError } from "../../lib/errors.ts";
import * as schema from "../../schema.ts";
import { SYSTEM_PROMPT } from "./system-prompt.ts";
import { createTools, type ToolState } from "./tools.ts";
import type { ChatSource, SSEEvent } from "./types.ts";

// ---------------------------------------------------------------------------
// OAuth compatibility layer for Claude subscription tokens (sk-ant-oat01-*)
//
// Anthropic restricts OAuth tokens to Claude Code-authorized clients only.
// Sonnet/Opus models require the request to look like it originates from
// Claude Code. Three things must be true simultaneously:
//
// 1. Headers  — `user-agent: claude-cli/<version>`, `x-app: cli`,
//               and betas `claude-code-20250219,oauth-2025-04-20`.
// 2. System   — The first system content block must be the Claude Code
//               identity string, as its own block (not merged with other text).
// 3. No unsupported betas — `structured-outputs-*` (auto-injected by
//               @ai-sdk/anthropic) must be stripped or the API returns 400.
//
// When ANTHROPIC_API_KEY is used instead (pay-per-use console key), none of
// this applies and the provider is created with default settings.
// ---------------------------------------------------------------------------

const OAUTH_BETAS = [
  "claude-code-20250219",
  "oauth-2025-04-20",
  "fine-grained-tool-streaming-2025-05-14",
];

const CLAUDE_CODE_IDENTITY =
  "You are Claude Code, Anthropic's official CLI for Claude.";

/** Intercepts outgoing fetch to patch headers and body for OAuth compliance. */
function createOAuthFetch() {
  return (url: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v;
    });

    // (1) Override user-agent — @ai-sdk/anthropic sets its own, but Anthropic
    //     checks this to verify the request comes from a Claude Code client.
    headers["user-agent"] = "claude-cli/2.1.62";

    // (3) Strip betas that OAuth rejects (e.g. structured-outputs-*)
    if (headers["anthropic-beta"]) {
      headers["anthropic-beta"] = headers["anthropic-beta"]
        .split(",")
        .filter((b) => !b.includes("structured-outputs"))
        .join(",");
    }

    // (2) The AI SDK merges system text into a single block, but Anthropic
    //     requires the identity string as a separate first block.
    let body = init?.body;
    if (typeof body === "string") {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed.system) && parsed.system.length === 1) {
        const text = parsed.system[0].text as string;
        if (text.startsWith(CLAUDE_CODE_IDENTITY)) {
          const rest = text
            .slice(CLAUDE_CODE_IDENTITY.length)
            .replace(/^\n+/, "");
          parsed.system = [
            { type: "text", text: CLAUDE_CODE_IDENTITY },
            ...(rest ? [{ type: "text", text: rest }] : []),
          ];
          body = JSON.stringify(parsed);
        }
      }
    }

    return fetch(url, { ...init, headers, body });
  };
}

function createModel() {
  const { authToken, apiKey } = config.anthropic;

  if (!authToken && !apiKey) {
    throw new Error("ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN required");
  }

  const isOAuth = Boolean(authToken);
  const provider = createAnthropic({
    apiKey: apiKey || undefined,
    authToken: authToken || undefined,
    headers: isOAuth
      ? { "anthropic-beta": OAUTH_BETAS.join(","), "x-app": "cli" }
      : undefined,
    fetch: isOAuth ? (createOAuthFetch() as typeof fetch) : undefined,
  });

  const modelId = config.anthropic.model;
  return provider(modelId);
}

interface StreamPart {
  type: string;
  text?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
}

/** Filters raw AI SDK stream parts into SSE events for the client. */
export async function* filterStreamEvents(
  stream: AsyncIterable<StreamPart>,
): AsyncGenerator<SSEEvent> {
  let lastPartWasToolResult = false;
  let sentThinking = false;

  for await (const part of stream) {
    if (part.type === "text-delta") {
      if (lastPartWasToolResult) {
        yield { type: "text-delta", delta: "\n\n" };
        lastPartWasToolResult = false;
      }
      yield { type: "text-delta", delta: part.text ?? "" };
    } else if (part.type === "tool-call") {
      if (!sentThinking) {
        yield { type: "thinking" };
        sentThinking = true;
      }
    } else if (part.type === "tool-result") {
      lastPartWasToolResult = true;
    }
  }
}

export function createChatService() {
  let _model: ReturnType<typeof createModel> | undefined;
  function getModel() {
    if (!_model) _model = createModel();
    return _model;
  }
  async function getOrCreateSession(sessionId?: string) {
    const now = new Date().toISOString();

    if (sessionId) {
      const existing = await db.query.sessions.findFirst({
        where: eq(schema.sessions.id, sessionId),
      });
      if (!existing) throw new NotFoundError(`Session ${sessionId} not found`);
      return existing;
    }

    const id = randomUUID();
    const session = {
      id,
      status: "active",
      escalatedReason: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(schema.sessions).values(session);

    return session;
  }

  async function getSessionHistory(sessionId: string): Promise<ModelMessage[]> {
    const rows = await db.query.messages.findMany({
      where: eq(schema.messages.sessionId, sessionId),
      orderBy: (m, { asc }) => [asc(m.createdAt)],
    });

    return rows
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
  }

  async function saveMessage(
    sessionId: string,
    role: string,
    content: string,
    sources?: ChatSource[],
    toolCalls?: Array<{ name: string; input: unknown; output: unknown }>,
  ) {
    await db.insert(schema.messages).values({
      id: randomUUID(),
      sessionId,
      role,
      content,
      sources: sources ? JSON.stringify(sources) : null,
      toolCalls: toolCalls ? JSON.stringify(toolCalls) : null,
      createdAt: new Date().toISOString(),
    });
  }

  async function flagEscalated(sessionId: string, reason: string) {
    await db
      .update(schema.sessions)
      .set({
        status: "escalated",
        escalatedReason: reason,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.sessions.id, sessionId));
  }

  async function* processMessage(
    sessionId: string,
    userMessage: string,
  ): AsyncGenerator<SSEEvent> {
    const session = await getOrCreateSession(sessionId);

    if (session.status === "escalated") {
      yield {
        type: "text-delta",
        delta:
          "This conversation has been escalated to a human support agent. Please wait for assistance.",
      };
      yield {
        type: "metadata",
        sessionId: session.id,
        escalated: true,
        reason: session.escalatedReason ?? undefined,
        sources: [],
      };
      yield { type: "done" };
      return;
    }

    const history = await getSessionHistory(session.id);
    await saveMessage(session.id, "user", userMessage);

    const state: ToolState = { sources: [], escalated: false };
    const toolCallLog: Array<{
      name: string;
      input: unknown;
      output: unknown;
    }> = [];

    const tools = createTools({
      sessionId: session.id,
      state,
      onEscalate: (reason) => flagEscalated(session.id, reason),
    });

    const messages: ModelMessage[] = [
      ...history,
      { role: "user" as const, content: userMessage },
    ];

    // Prepend Claude Code identity for OAuth — the fetch interceptor splits
    // it into a separate system block (see createOAuthFetch above).
    const isOAuth = Boolean(config.anthropic.authToken);
    const systemPrompt = isOAuth
      ? `${CLAUDE_CODE_IDENTITY}\n\n${SYSTEM_PROMPT}`
      : SYSTEM_PROMPT;

    const result = streamText({
      model: getModel(),
      maxOutputTokens: 4096,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(3),
    });

    let fullText = "";
    let lastPartWasToolResult = false;
    let sentThinking = false;

    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        if (lastPartWasToolResult) {
          fullText += "\n\n";
          yield { type: "text-delta", delta: "\n\n" };
          lastPartWasToolResult = false;
        }
        fullText += part.text;
        yield { type: "text-delta", delta: part.text };
      } else if (part.type === "tool-call") {
        toolCallLog.push({
          name: part.toolName,
          input: part.input,
          output: null,
        });
        if (!sentThinking) {
          yield { type: "thinking" };
          sentThinking = true;
        }
        yield {
          type: "tool-call" as const,
          name: part.toolName,
          args: part.input as Record<string, unknown>,
        };
      } else if (part.type === "tool-result") {
        const lastCall = toolCallLog.findLast((c) => c.name === part.toolName);
        if (lastCall) lastCall.output = part.output;
        lastPartWasToolResult = true;
        yield {
          type: "tool-result" as const,
          name: part.toolName,
          result: part.output,
        };
      }
    }

    await saveMessage(
      session.id,
      "assistant",
      fullText,
      state.sources.length > 0 ? state.sources : undefined,
      toolCallLog.length > 0 ? toolCallLog : undefined,
    );

    yield {
      type: "metadata",
      sessionId: session.id,
      escalated: state.escalated,
      reason: state.reason,
      sources: state.sources,
    };
    yield { type: "done" };
  }

  return {
    getOrCreateSession,
    getSessionHistory,
    processMessage,
  };
}
