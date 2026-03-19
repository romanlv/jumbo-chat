import { asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db.ts";
import { NotFoundError } from "../../lib/errors.ts";
import * as schema from "../../schema.ts";

export async function listSessions({
  status,
  page = 1,
  limit = 20,
}: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const where = status ? eq(schema.sessions.status, status) : undefined;

  const [sessions, countResult] = await Promise.all([
    db
      .select({
        id: schema.sessions.id,
        status: schema.sessions.status,
        escalatedReason: schema.sessions.escalatedReason,
        createdAt: schema.sessions.createdAt,
        updatedAt: schema.sessions.updatedAt,
        messageCount: sql<number>`(
          select count(*) from messages
          where messages.session_id = sessions.id
        )`.as("message_count"),
        lastMessage: sql<string | null>`(
          select content from messages
          where messages.session_id = sessions.id
          order by messages.created_at desc limit 1
        )`.as("last_message"),
        lastMessageRole: sql<string | null>`(
          select role from messages
          where messages.session_id = sessions.id
          order by messages.created_at desc limit 1
        )`.as("last_message_role"),
      })
      .from(schema.sessions)
      .where(where)
      .orderBy(desc(schema.sessions.updatedAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(schema.sessions).where(where),
  ]);

  const total = countResult[0]?.total ?? 0;

  return { sessions, total, page, limit };
}

export async function getSessionDetail(id: string) {
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, id),
  });

  if (!session) throw new NotFoundError(`Session ${id} not found`);

  const messages = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.sessionId, id))
    .orderBy(asc(schema.messages.createdAt));

  return { ...session, messages };
}

export async function updateSessionStatus(id: string, status: string) {
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, id),
  });

  if (!session) throw new NotFoundError(`Session ${id} not found`);

  await db
    .update(schema.sessions)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(schema.sessions.id, id));

  return { ...session, status, updatedAt: new Date().toISOString() };
}
