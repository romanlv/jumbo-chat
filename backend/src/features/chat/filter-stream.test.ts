import { describe, expect, test } from "bun:test";
import type { SSEEvent } from "./types.ts";
import { filterStreamEvents } from "./service.ts";

async function* fakeStream(
  parts: Array<{ type: string; text?: string; toolName?: string }>,
) {
  for (const part of parts) {
    yield part;
  }
}

async function collect(stream: AsyncIterable<SSEEvent>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe("filterStreamEvents", () => {
  test("passes through text-delta events", async () => {
    const events = await collect(
      filterStreamEvents(
        fakeStream([
          { type: "text-delta", text: "Hello " },
          { type: "text-delta", text: "world" },
        ]),
      ),
    );

    expect(events).toEqual([
      { type: "text-delta", delta: "Hello " },
      { type: "text-delta", delta: "world" },
    ]);
  });

  test("replaces tool-call with a single thinking event", async () => {
    const events = await collect(
      filterStreamEvents(
        fakeStream([
          { type: "tool-call", toolName: "search_knowledge_base" },
          { type: "tool-result", toolName: "search_knowledge_base" },
          { type: "tool-call", toolName: "search_knowledge_base" },
          { type: "tool-result", toolName: "search_knowledge_base" },
          { type: "text-delta", text: "Here is the answer" },
        ]),
      ),
    );

    const thinkingEvents = events.filter((e) => e.type === "thinking");
    expect(thinkingEvents).toHaveLength(1);
  });

  test("never emits tool-call or tool-result events", async () => {
    const events = await collect(
      filterStreamEvents(
        fakeStream([
          { type: "tool-call", toolName: "search_knowledge_base" },
          { type: "tool-result", toolName: "search_knowledge_base" },
          { type: "text-delta", text: "Answer" },
        ]),
      ),
    );

    const leakedTypes = events.filter(
      (e) => e.type === "tool-call" || e.type === "tool-result",
    );
    expect(leakedTypes).toHaveLength(0);
  });

  test("inserts newline separator after tool results before text", async () => {
    const events = await collect(
      filterStreamEvents(
        fakeStream([
          { type: "text-delta", text: "Let me search." },
          { type: "tool-call", toolName: "search_knowledge_base" },
          { type: "tool-result", toolName: "search_knowledge_base" },
          { type: "text-delta", text: "Found it!" },
        ]),
      ),
    );

    expect(events).toEqual([
      { type: "text-delta", delta: "Let me search." },
      { type: "thinking" },
      { type: "text-delta", delta: "\n\n" },
      { type: "text-delta", delta: "Found it!" },
    ]);
  });

  test("text-only stream emits no thinking event", async () => {
    const events = await collect(
      filterStreamEvents(
        fakeStream([
          { type: "text-delta", text: "Simple answer" },
        ]),
      ),
    );

    expect(events).toEqual([{ type: "text-delta", delta: "Simple answer" }]);
  });
});
