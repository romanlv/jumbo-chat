import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureVectorIndex, initDb, runMigrations } from "../lib/db.ts";

export async function initTestDb(): Promise<string> {
  const dbPath = join(
    tmpdir(),
    `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  initDb(`file:${dbPath}`);
  await runMigrations();
  await ensureVectorIndex();
  return dbPath;
}
