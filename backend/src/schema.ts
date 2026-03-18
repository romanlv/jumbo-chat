import { sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const float32Vector = customType<{
  data: number[];
  config: { dimensions: number };
  configRequired: true;
  driverData: Buffer;
}>({
  dataType(config) {
    return `F32_BLOB(${config.dimensions})`;
  },
  fromDriver(value: Buffer) {
    return Array.from(new Float32Array(value.buffer));
  },
  toDriver(value: number[]) {
    return sql`vector32(${JSON.stringify(value)})`;
  },
});

export const documents = sqliteTable(
  "documents",
  {
    rowid: integer("rowid").primaryKey({ autoIncrement: true }),
    chunkId: text("chunk_id").notNull().unique(),
    sourceUrl: text("source_url").notNull(),
    title: text("title").notNull(),
    priority: integer("priority").notNull().default(2),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: float32Vector("embedding", { dimensions: 1536 }),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_documents_source_url").on(table.sourceUrl)],
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("active"),
  escalatedReason: text("escalated_reason"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  sources: text("sources"),
  toolCalls: text("tool_calls"),
  createdAt: text("created_at").notNull(),
});
