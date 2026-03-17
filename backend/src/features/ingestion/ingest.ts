import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import Firecrawl from "@mendable/firecrawl-js";
import { config } from "../../config.ts";
import { getDb } from "../../lib/db.ts";
import { generateEmbeddings } from "../knowledge/embeddings.ts";
import {
  type ChunkWithEmbedding,
  LibSQLVectorStore,
  type VectorStore,
} from "../knowledge/vector-store.ts";
import { type Chunk, type ChunkInput, chunkDocument } from "./chunker.ts";

interface Source {
  url: string;
  title: string;
  priority: number;
}

export function urlToSlug(url: string): string {
  const pathname = new URL(url).pathname.replace(/^\/|\/$/g, "");
  if (!pathname) return "homepage";
  return pathname.replace(/\//g, "-");
}

interface IngestionDeps {
  fetch: boolean;
  store: VectorStore;
  dataDir: string;
  sources: Source[];
  embedFn: (texts: string[]) => Promise<number[][]>;
  fetchPage?: (url: string) => Promise<string>;
}

export async function runIngestion(deps: IngestionDeps): Promise<void> {
  const {
    fetch: shouldFetch,
    store,
    dataDir,
    sources,
    embedFn,
    fetchPage,
  } = deps;
  const kbDir = resolve(dataDir, "kb");
  mkdirSync(kbDir, { recursive: true });

  await store.initialize();

  if (shouldFetch) {
    if (!fetchPage) throw new Error("fetchPage required when --fetch is set");
    console.log("Fetching pages...");
    for (const source of sources) {
      const slug = urlToSlug(source.url);
      console.log(`  Fetching ${source.url} → ${slug}.md`);
      const markdown = await fetchPage(source.url);
      writeFileSync(resolve(kbDir, `${slug}.md`), markdown, "utf-8");
    }
  }

  let totalChunks = 0;

  for (const source of sources) {
    const slug = urlToSlug(source.url);
    const filePath = resolve(kbDir, `${slug}.md`);

    if (!existsSync(filePath)) {
      console.log(`  Skipping ${source.title} — no markdown file found`);
      continue;
    }

    const content = readFileSync(filePath, "utf-8");
    const input: ChunkInput = {
      sourceUrl: source.url,
      title: source.title,
      priority: source.priority,
      content,
    };

    const chunks: Chunk[] = chunkDocument(input);
    if (chunks.length === 0) {
      console.log(`  Skipping ${source.title} — no chunks`);
      continue;
    }

    const embeddings = await embedFn(chunks.map((c) => c.content));

    const chunksWithEmbeddings: ChunkWithEmbedding[] = chunks.map((c, i) => ({
      ...c,
      embedding: embeddings[i] as number[],
    }));

    await store.deleteBySourceUrl(source.url);
    await store.upsertChunks(chunksWithEmbeddings);

    console.log(`  ${source.title}: ${chunks.length} chunks`);
    totalChunks += chunks.length;
  }

  console.log(`Done. Total chunks indexed: ${totalChunks}`);
}

// CLI entry point
async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      fetch: { type: "boolean", default: false },
    },
  });

  const baseDir = import.meta.dirname ?? ".";
  const sourcesPath = resolve(baseDir, "../../../data/sources.json");
  const sources: Source[] = JSON.parse(readFileSync(sourcesPath, "utf-8"));

  const db = getDb();
  const store = new LibSQLVectorStore(db);
  const dataDir = resolve(baseDir, "../../../data");

  let fetchPage: ((url: string) => Promise<string>) | undefined;
  if (values.fetch) {
    const firecrawl = new Firecrawl({
      apiKey: config.firecrawl.apiKey,
    });
    fetchPage = async (url: string) => {
      const result = await firecrawl.scrape(url, {
        formats: ["markdown"],
      });
      return result.markdown ?? "";
    };
  }

  await runIngestion({
    fetch: values.fetch ?? false,
    store,
    dataDir,
    sources,
    embedFn: generateEmbeddings,
    fetchPage,
  });
}

// Only run main when executed directly
const isDirectRun =
  process.argv[1] &&
  import.meta.filename &&
  resolve(process.argv[1]) === resolve(import.meta.filename);

if (isDirectRun) {
  main().catch((err) => {
    console.error("Ingestion failed:", err);
    process.exit(1);
  });
}
