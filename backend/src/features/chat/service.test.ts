import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db.ts";
import * as schema from "../../schema.ts";
import {
  resetTestData,
  setupTestDb,
  teardownTestDb,
} from "../../utils/test-utils.ts";

// We test the service's session/message logic using the DB directly,
// since the full processMessage requires a real LLM.

describe("chat service persistence", () => {
  beforeAll(setupTestDb);
  beforeEach(resetTestData);
  afterAll(teardownTestDb);

  test("session creation inserts a row", async () => {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const session = await db.query.sessions.findFirst({
      where: eq(schema.sessions.id, id),
    });
    expect(session).toBeDefined();
    expect(session?.status).toBe("active");
  });

  test("message persistence with sources", async () => {
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(schema.sessions).values({
      id: sessionId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const sources = [
      {
        sourceUrl: "https://example.com",
        title: "Test",
        chunkIndex: 0,
        score: 0.9,
      },
    ];

    await db.insert(schema.messages).values({
      id: crypto.randomUUID(),
      sessionId,
      role: "assistant",
      content: "Test answer",
      sources: JSON.stringify(sources),
      createdAt: now,
    });

    const messages = await db.query.messages.findMany({
      where: eq(schema.messages.sessionId, sessionId),
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("Test answer");
    expect(JSON.parse(messages[0]?.sources as string)).toEqual(sources);
  });

  test("session escalation updates status", async () => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(schema.sessions).values({
      id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await db
      .update(schema.sessions)
      .set({
        status: "escalated",
        escalatedReason: "Account-specific question",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.sessions.id, id));

    const session = await db.query.sessions.findFirst({
      where: eq(schema.sessions.id, id),
    });
    expect(session?.status).toBe("escalated");
    expect(session?.escalatedReason).toBe("Account-specific question");
  });

  test("message history returns ordered messages", async () => {
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(schema.sessions).values({
      id: sessionId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.messages).values([
      {
        id: crypto.randomUUID(),
        sessionId,
        role: "user",
        content: "First message",
        createdAt: "2024-01-01T00:00:00Z",
      },
      {
        id: crypto.randomUUID(),
        sessionId,
        role: "assistant",
        content: "First reply",
        createdAt: "2024-01-01T00:00:01Z",
      },
      {
        id: crypto.randomUUID(),
        sessionId,
        role: "user",
        content: "Second message",
        createdAt: "2024-01-01T00:00:02Z",
      },
    ]);

    const messages = await db.query.messages.findMany({
      where: eq(schema.messages.sessionId, sessionId),
      orderBy: (m, { asc }) => [asc(m.createdAt)],
    });

    expect(messages).toHaveLength(3);
    expect(messages[0]?.content).toBe("First message");
    expect(messages[1]?.content).toBe("First reply");
    expect(messages[2]?.content).toBe("Second message");
  });
});
