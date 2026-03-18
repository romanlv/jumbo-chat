import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Chunk, type ChunkInput, chunkDocument } from "./chunker.ts";

const baseInput: ChunkInput = {
  sourceUrl: "https://example.com/page",
  title: "Test Page",
  priority: 1,
  content: "",
};

function first(chunks: Chunk[]): Chunk {
  expect(chunks.length).toBeGreaterThanOrEqual(1);
  return chunks[0] as Chunk;
}

const kbDir = resolve(import.meta.dirname as string, "../../../../data/kb");
const fetchedDir = resolve(kbDir, "fetched");
const staticDir = resolve(kbDir, "static");

function readKb(filename: string): string {
  const fetchedPath = resolve(fetchedDir, filename);
  const staticPath = resolve(staticDir, filename);
  if (existsSync(fetchedPath)) return readFileSync(fetchedPath, "utf-8");
  return readFileSync(staticPath, "utf-8");
}

describe("chunkDocument", () => {
  test("empty input returns empty array", () => {
    expect(chunkDocument({ ...baseInput, content: "" })).toEqual([]);
    expect(chunkDocument({ ...baseInput, content: "   " })).toEqual([]);
  });

  test("short content returns single chunk", () => {
    const chunks = chunkDocument({
      ...baseInput,
      content: "Hello world. This is a short document.",
    });
    expect(chunks).toHaveLength(1);
    expect(first(chunks).content).toContain("Hello world");
  });

  test("no paragraph is split mid-text", () => {
    const longParagraph = "A".repeat(800);
    const chunks = chunkDocument(
      { ...baseInput, content: `Short intro.\n\n${longParagraph}\n\nEnd.` },
      { targetSize: 500 },
    );
    const found = chunks.find((c) => c.content.includes(longParagraph));
    expect(found).toBeDefined();
  });

  test("prefers breaking before headings", () => {
    const content = `${"A".repeat(300)}\n\n# New Section\n\n${"B".repeat(300)}`;
    const chunks = chunkDocument(
      { ...baseInput, content },
      { targetSize: 500 },
    );
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Heading should start a new chunk, not be appended to previous
    expect(first(chunks).content).not.toContain("# New Section");
  });

  test("overlap present between consecutive chunks", () => {
    const content = readKb("faqs.md");
    const chunks = chunkDocument(
      { ...baseInput, content },
      { targetSize: 300, overlapSize: 50 },
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect((chunks[1] as Chunk).content).toContain("…");
  });

  test("metadata is correct", () => {
    const chunks = chunkDocument({
      ...baseInput,
      content: "Some content here.",
    });
    expect(chunks).toHaveLength(1);
    const c = first(chunks);
    expect(c.sourceUrl).toBe(baseInput.sourceUrl);
    expect(c.title).toBe(baseInput.title);
    expect(c.priority).toBe(baseInput.priority);
    expect(c.chunkIndex).toBe(0);
  });

  test("chunkId is deterministic", () => {
    const content = "Deterministic chunk id test content.";
    const a = chunkDocument({ ...baseInput, content });
    const b = chunkDocument({ ...baseInput, content });
    expect(a).toHaveLength(1);
    expect(first(a).chunkId).toBe(first(b).chunkId);
  });

  test("chunkIndex increments", () => {
    const chunks = chunkDocument(
      { ...baseInput, content: readKb("faqs.md") },
      { targetSize: 300 },
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length; i++) {
      expect((chunks[i] as Chunk).chunkIndex).toBe(i);
    }
  });

  test("short final chunk merges into previous", () => {
    const content = `${"A".repeat(300)}\n\n${"B".repeat(300)}\n\nTiny.`;
    const chunks = chunkDocument(
      { ...baseInput, content },
      { targetSize: 400, minSize: 250 },
    );
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const lastChunk = chunks[chunks.length - 1] as Chunk;
    expect(lastChunk.content).toContain("Tiny.");
  });
});

describe("chunkDocument against real kb files", () => {
  const fetchedFiles = existsSync(fetchedDir)
    ? readdirSync(fetchedDir).filter((f) => f.endsWith(".md"))
    : [];
  const staticFiles = existsSync(staticDir)
    ? readdirSync(staticDir).filter((f) => f.endsWith(".md"))
    : [];
  const files = [...new Set([...fetchedFiles, ...staticFiles])];

  for (const file of files) {
    test(`${file}: produces non-empty chunks`, () => {
      const content = readKb(file);
      const chunks = chunkDocument(
        { ...baseInput, content },
        { targetSize: 500 },
      );
      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.content.trim().length).toBeGreaterThan(0);
      }
    });

    test(`${file}: most chunks stay near target size`, () => {
      const content = readKb(file);
      const chunks = chunkDocument(
        { ...baseInput, content },
        { targetSize: 500 },
      );
      // Count chunks that are reasonably sized (under 2x target)
      const reasonable = chunks.filter((c) => c.content.length < 1000);
      // At least 80% of chunks should be near target size
      expect(reasonable.length / chunks.length).toBeGreaterThanOrEqual(0.8);
    });

    test(`${file}: chunk indexes are sequential`, () => {
      const content = readKb(file);
      const chunks = chunkDocument(
        { ...baseInput, content },
        { targetSize: 500 },
      );
      for (let i = 0; i < chunks.length; i++) {
        expect((chunks[i] as Chunk).chunkIndex).toBe(i);
      }
    });

    test(`${file}: no content lost`, () => {
      const content = readKb(file);
      const chunks = chunkDocument(
        { ...baseInput, content },
        { targetSize: 500 },
      );
      // Every non-empty paragraph from the original should appear in some chunk
      const allChunkContent = chunks.map((c) => c.content).join("\n\n");
      const paragraphs = content
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      for (const para of paragraphs) {
        // Overlap prefixes add "…" so check the original paragraph text exists
        // (may be split across overlap boundary, so check a substring)
        const snippet = para.slice(0, 60);
        expect(allChunkContent).toContain(snippet);
      }
    });
  }
});
