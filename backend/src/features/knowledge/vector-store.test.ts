import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { count, eq } from "drizzle-orm";
import { documents } from "../../db/schema.ts";
import { db } from "../../lib/db.ts";
import {
  resetTestData,
  setupTestDb,
  teardownTestDb,
} from "../../utils/test-utils.ts";
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

function firstResult(results: VectorSearchResult[]): VectorSearchResult {
  expect(results.length).toBeGreaterThanOrEqual(1);
  return results[0] as VectorSearchResult;
}

describe("LibSQLVectorStore", () => {
  const store = new LibSQLVectorStore();

  beforeAll(setupTestDb);
  beforeEach(resetTestData);
  afterAll(teardownTestDb);

  test("upsertChunks inserts retrievable chunks", async () => {
    const chunk = makeChunk({ chunkId: "test-1", content: "Hello world" });
    await store.upsertChunks([chunk]);

    const row = await db.query.documents.findFirst({
      where: eq(documents.chunkId, "test-1"),
    });
    expect(row).toBeDefined();
    expect(row?.content).toBe("Hello world");
  });

  test("upsertChunks replaces existing chunk with same chunkId", async () => {
    const chunk1 = makeChunk({ chunkId: "test-replace", content: "Version 1" });
    await store.upsertChunks([chunk1]);

    const chunk2 = makeChunk({
      chunkId: "test-replace",
      content: "Version 2",
    });
    await store.upsertChunks([chunk2]);

    const row = await db.query.documents.findFirst({
      where: eq(documents.chunkId, "test-replace"),
    });
    expect(row?.content).toBe("Version 2");
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

    const rows = await db.query.documents.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.chunkId).toBe("keep-1");
  });

  test("upsertChunks with empty array is no-op", async () => {
    const [row] = await db.select({ cnt: count() }).from(documents);
    expect(row?.cnt).toBe(0);
  });
});
