import { type Client, createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { config } from "../config.ts";
import * as schema from "../db/schema.ts";

let client: Client | null = null;
let drizzleDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function initDb(url: string, authToken?: string): Client {
  client = createClient({ url, authToken });
  drizzleDb = null;
  return client;
}

export function getDb(): Client {
  if (!client) {
    client = createClient({
      url: config.db.url,
      authToken: config.db.authToken,
    });
  }
  return client;
}

export function getDrizzle() {
  if (!drizzleDb) {
    drizzleDb = drizzle(getDb(), { schema });
  }
  return drizzleDb;
}

export async function runMigrations(): Promise<void> {
  await migrate(getDrizzle(), { migrationsFolder: "./drizzle" });
}

/**
 * Vector index uses libsql_vector_idx which Drizzle can't generate.
 * Must be applied separately after migrations.
 */
export async function ensureVectorIndex(): Promise<void> {
  await getDb().execute(
    "CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents(libsql_vector_idx(embedding))",
  );
}

export function resetDb(): void {
  drizzleDb = null;
  client?.close();
  client = null;
}
