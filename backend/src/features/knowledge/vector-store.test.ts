import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import type { Row } from "@libsql/client";
import { getDb, resetDb } from "../../lib/db.ts";
import { initTestDb } from "../../utils/test-utils.ts";
import {
  type ChunkWithEmbedding,
  LibSQLVectorStore,
  type VectorSearchResult,
} from "./vector-store.ts";

function makeFakeEmbedding(seed: number): number[] {
  const embedding = new Array(1536);
  for (let i = 0; i < 1536; i++) {
    embedding[i] = Math.sin(seed * 1000 + i) * 0.5;
  }
  return embedding;
}

function makeChunk(
  overrides: Partial<ChunkWithEmbedding> = {},
): ChunkWithEmbedding {
  return {
    chunkId: `chunk-${Math.random().toString(36).slice(2, 8)}`,
    sourceUrl: "https://example.com/page",
    title: "Test Page",
    priority: 1,
    chunkIndex: 0,
    content: "Test content",
    embedding: makeFakeEmbedding(1),
    ...overrides,
  };
}

function firstRow(rows: Row[]): Row {
  expect(rows.length).toBeGreaterThanOrEqual(1);
  return rows[0] as Row;
}

function firstResult(results: VectorSearchResult[]): VectorSearchResult {
  expect(results.length).toBeGreaterThanOrEqual(1);
  return results[0] as VectorSearchResult;
}

describe("LibSQLVectorStore", () => {
  let store: LibSQLVectorStore;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = await initTestDb();
    store = new LibSQLVectorStore(getDb());
  });

  afterEach(() => {
    resetDb();
    try {
      rmSync(dbPath, { force: true });
      rmSync(`${dbPath}-wal`, { force: true });
      rmSync(`${dbPath}-shm`, { force: true });
    } catch {}
  });

  test("upsertChunks inserts retrievable chunks", async () => {
    const chunk = makeChunk({ chunkId: "test-1", content: "Hello world" });
    await store.upsertChunks([chunk]);

    const result = await getDb().execute(
      "SELECT chunk_id, content FROM documents WHERE chunk_id = 'test-1'",
    );
    expect(result.rows).toHaveLength(1);
    expect(firstRow(result.rows).content).toBe("Hello world");
  });

  test("upsertChunks replaces existing chunk with same chunkId", async () => {
    const chunk1 = makeChunk({ chunkId: "test-replace", content: "Version 1" });
    await store.upsertChunks([chunk1]);

    const chunk2 = makeChunk({
      chunkId: "test-replace",
      content: "Version 2",
    });
    await store.upsertChunks([chunk2]);

    const result = await getDb().execute(
      "SELECT content FROM documents WHERE chunk_id = 'test-replace'",
    );
    expect(result.rows).toHaveLength(1);
    expect(firstRow(result.rows).content).toBe("Version 2");
  });

  test("search returns results ordered by distance", async () => {
    const chunks = [
      makeChunk({
        chunkId: "a",
        content: "First",
        embedding: makeFakeEmbedding(1),
      }),
      makeChunk({
        chunkId: "b",
        content: "Second",
        embedding: makeFakeEmbedding(2),
      }),
      makeChunk({
        chunkId: "c",
        content: "Third",
        embedding: makeFakeEmbedding(3),
      }),
    ];
    await store.upsertChunks(chunks);

    const results = await store.search(makeFakeEmbedding(1), 3);
    expect(firstResult(results).content).toBe("First");
    for (let i = 1; i < results.length; i++) {
      expect(
        (results[i] as VectorSearchResult).distance,
      ).toBeGreaterThanOrEqual((results[i - 1] as VectorSearchResult).distance);
    }
  });

  test("search with no data returns empty array", async () => {
    const results = await store.search(makeFakeEmbedding(42), 5);
    expect(results).toEqual([]);
  });

  test("topK limits results", async () => {
    const chunks = Array.from({ length: 10 }, (_, i) =>
      makeChunk({
        chunkId: `topk-${i}`,
        content: `Content ${i}`,
        embedding: makeFakeEmbedding(i),
      }),
    );
    await store.upsertChunks(chunks);

    const results = await store.search(makeFakeEmbedding(0), 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  test("deleteBySourceUrl removes correct chunks", async () => {
    const url1 = "https://example.com/page1";
    const url2 = "https://example.com/page2";

    await store.upsertChunks([
      makeChunk({ chunkId: "del-1", sourceUrl: url1 }),
      makeChunk({ chunkId: "del-2", sourceUrl: url1 }),
      makeChunk({ chunkId: "keep-1", sourceUrl: url2 }),
    ]);

    await store.deleteBySourceUrl(url1);

    const result = await getDb().execute("SELECT chunk_id FROM documents");
    expect(result.rows).toHaveLength(1);
    expect(firstRow(result.rows).chunk_id).toBe("keep-1");
  });

  test("upsertChunks with empty array is no-op", async () => {
    await store.upsertChunks([]);
    const result = await getDb().execute(
      "SELECT count(*) as cnt FROM documents",
    );
    expect(firstRow(result.rows).cnt).toBe(0);
  });
});
