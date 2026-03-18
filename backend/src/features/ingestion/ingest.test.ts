import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  resetTestData,
  setupTestDb,
  teardownTestDb,
} from "../../utils/test-utils.ts";
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
  const store = new LibSQLVectorStore();
  let tmpDir: string;

  beforeAll(setupTestDb);
  afterAll(teardownTestDb);

  beforeEach(async () => {
    await resetTestData();
    tmpDir = resolve(
      import.meta.dirname ?? ".",
      `../../../.tmp-test-${Date.now()}`,
    );
    await mkdir(resolve(tmpDir, "fetched"), { recursive: true });
    await mkdir(resolve(tmpDir, "static"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  test("ingests markdown files into vector store", async () => {
    const sources = [
      {
        url: "https://example.com/faq",
        title: "FAQ",
        priority: 1,
      },
    ];

    await Bun.write(
      resolve(tmpDir, "fetched/faq.md"),
      "# FAQ\n\nWhat is this?\n\nThis is a test document with some content.",
    );

    await runIngestion({
      fetch: false,
      store,
      kbDir: tmpDir,
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

    await Bun.write(
      resolve(tmpDir, "fetched/page.md"),
      "# Page\n\nOriginal content here.",
    );

    await runIngestion({
      fetch: false,
      store,
      kbDir: tmpDir,
      sources,
      embedFn: fakeEmbedFn,
    });

    await Bun.write(
      resolve(tmpDir, "fetched/page.md"),
      "# Page\n\nUpdated content here.",
    );

    await runIngestion({
      fetch: false,
      store,
      kbDir: tmpDir,
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
      kbDir: tmpDir,
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
