import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const documents = sqliteTable("documents", {
  rowid: integer("rowid").primaryKey({ autoIncrement: true }),
  chunkId: text("chunk_id").notNull().unique(),
  sourceUrl: text("source_url").notNull(),
  title: text("title").notNull(),
  priority: integer("priority").notNull().default(2),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  updatedAt: text("updated_at").notNull(),
});
