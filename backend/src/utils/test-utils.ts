import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTableName } from "drizzle-orm";
import {
  closeDb,
  db,
  ensureVectorIndex,
  initDb,
  runMigrations,
} from "../db.ts";
import * as schema from "../schema.ts";

const allTables = Object.values(schema).filter(
  (v) => typeof v === "object" && v !== null && "getSQL" in v,
);

let currentDbPath: string | null = null;

/** Call in beforeAll — creates DB, runs migrations once per test file. */
export async function setupTestDb() {
  const dbPath = join(
    tmpdir(),
    `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  currentDbPath = dbPath;
  initDb(`file:${dbPath}`);
  await runMigrations();
  await ensureVectorIndex();
}

/** Call in beforeEach — clears all table data between tests. */
export async function resetTestData() {
  for (const table of allTables) {
    await db.$client.execute(`DELETE FROM "${getTableName(table)}"`);
  }
  // Vector index retains stale entries after DELETE — rebuild it
  await db.$client.execute("DROP INDEX IF EXISTS idx_documents_embedding");
  await ensureVectorIndex();
}

/** Call in afterAll — closes connection, removes temp files. */
export function teardownTestDb() {
  closeDb();
  if (currentDbPath) {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        rmSync(`${currentDbPath}${suffix}`, { force: true });
      } catch {}
    }
    currentDbPath = null;
  }
}
