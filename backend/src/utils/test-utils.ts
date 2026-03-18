import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureVectorIndex,
  getDrizzle,
  initDb,
  resetDb,
  runMigrations,
} from "../lib/db.ts";

let currentDbPath: string | null = null;

export async function initTestDb() {
  const dbPath = join(
    tmpdir(),
    `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  currentDbPath = dbPath;
  initDb(`file:${dbPath}`);
  await runMigrations();
  await ensureVectorIndex();
  return getDrizzle();
}

export function cleanupTestDb() {
  resetDb();
  if (currentDbPath) {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        rmSync(`${currentDbPath}${suffix}`, { force: true });
      } catch {}
    }
    currentDbPath = null;
  }
}
