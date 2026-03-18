import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "../db/schema.ts";

export let db: ReturnType<typeof drizzle<typeof schema>>;

export function initDb(url: string, authToken?: string): void {
  const client = createClient({ url, authToken });
  db = drizzle(client, { schema });
}

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: "./drizzle" });
}

/**
 * Vector index uses libsql_vector_idx which Drizzle can't generate.
 * Must be applied separately after migrations.
 */
export async function ensureVectorIndex(): Promise<void> {
  await db.$client.execute(
    "CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents(libsql_vector_idx(embedding))",
  );
}

export function closeDb(): void {
  db?.$client?.close();
}
