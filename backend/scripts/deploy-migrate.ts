import { ensureVectorIndex, initDb, runMigrations } from "../src/db.ts";

initDb();
await runMigrations();
await ensureVectorIndex();
console.log("Migrations and vector index applied successfully");
