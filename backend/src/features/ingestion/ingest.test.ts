import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createClient } from "@libsql/client";
import {
  LibSQLVectorStore,
  type VectorSearchResult,
} from "../knowledge/vector-store.ts";
import { runIngestion, urlToSlug } from "./ingest.ts";

function makeFakeEmbedding(_seed: number): number[] {
  const embedding = new Array(1536);
  for (let i = 0; i < 1536; i++) {
    embedding[i] = Math.sin(_seed * 1000 + i) * 0.5;
  }
  return embedding;
}

const fakeEmbedFn = async (texts: string[]): Promise<number[][]> => {
  return texts.map((_, i) => makeFakeEmbedding(i));
};

describe("runIngestion", () => {
  let client: ReturnType<typeof createClient>;
  let store: LibSQLVectorStore;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = join(
      tmpdir(),
      `test-ingest-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    client = createClient({ url: `file:${dbPath}` });
    store = new LibSQLVectorStore(client);

    tmpDir = resolve(
      import.meta.dirname ?? ".",
      `../../../.tmp-test-${Date.now()}`,
    );
    mkdirSync(resolve(tmpDir, "kb"), { recursive: true });
  });

  afterEach(() => {
    client.close();
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
    try {
      rmSync(dbPath, { force: true });
      rmSync(`${dbPath}-wal`, { force: true });
      rmSync(`${dbPath}-shm`, { force: true });
    } catch {}
  });

  test("ingests markdown files into vector store", async () => {
    const sources = [
      {
        url: "https://example.com/faq",
        title: "FAQ",
        priority: 1,
      },
    ];

    writeFileSync(
      resolve(tmpDir, "kb/faq.md"),
      "# FAQ\n\nWhat is this?\n\nThis is a test document with some content.",
      "utf-8",
    );

    await runIngestion({
      fetch: false,
      store,
      dataDir: tmpDir,
      sources,
      embedFn: fakeEmbedFn,
    });

    const results = await store.search(makeFakeEmbedding(0), 5);
    expect(results.length).toBeGreaterThan(0);
    expect((results[0] as VectorSearchResult).sourceUrl).toBe(
      "https://example.com/faq",
    );
  });

  test("idempotency: re-running replaces old chunks", async () => {
    const sources = [
      {
        url: "https://example.com/page",
        title: "Page",
        priority: 1,
      },
    ];

    writeFileSync(
      resolve(tmpDir, "kb/page.md"),
      "# Page\n\nOriginal content here.",
      "utf-8",
    );

    await runIngestion({
      fetch: false,
      store,
      dataDir: tmpDir,
      sources,
      embedFn: fakeEmbedFn,
    });

    writeFileSync(
      resolve(tmpDir, "kb/page.md"),
      "# Page\n\nUpdated content here.",
      "utf-8",
    );

    await runIngestion({
      fetch: false,
      store,
      dataDir: tmpDir,
      sources,
      embedFn: fakeEmbedFn,
    });

    const results = await store.search(makeFakeEmbedding(0), 10);
    for (const r of results) {
      expect(r.content).not.toContain("Original");
    }
  });

  test("skips sources without markdown files", async () => {
    const sources = [
      {
        url: "https://example.com/missing",
        title: "Missing",
        priority: 1,
      },
    ];

    await runIngestion({
      fetch: false,
      store,
      dataDir: tmpDir,
      sources,
      embedFn: fakeEmbedFn,
    });

    const results = await store.search(makeFakeEmbedding(0), 5);
    expect(results).toEqual([]);
  });
});

describe("urlToSlug", () => {
  test("converts pathname to slug", () => {
    expect(urlToSlug("https://example.com/faqs")).toBe("faqs");
    expect(urlToSlug("https://example.com/terms-of-use")).toBe("terms-of-use");
  });

  test("root URL becomes homepage", () => {
    expect(urlToSlug("https://example.com/")).toBe("homepage");
    expect(urlToSlug("https://example.com")).toBe("homepage");
  });

  test("nested paths use dashes", () => {
    expect(urlToSlug("https://example.com/a/b/c")).toBe("a-b-c");
  });
});
