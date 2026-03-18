import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import Firecrawl from "@mendable/firecrawl-js";
import { config } from "../../config.ts";
import { initDb } from "../../db.ts";
import { generateEmbeddings } from "../knowledge/embeddings.ts";
import {
  type ChunkWithEmbedding,
  LibSQLVectorStore,
  type VectorStore,
} from "../knowledge/vector-store.ts";
import { type Chunk, type ChunkInput, chunkDocument } from "./chunker.ts";

interface Source {
  url?: string;
  file?: string;
  title: string;
  priority: number;
}

function sourceId(source: Source): string {
  const id = source.url ?? source.file;
  if (!id) throw new Error(`Source "${source.title}" must have url or file`);
  return id;
}

export function urlToSlug(url: string): string {
  const pathname = new URL(url).pathname.replace(/^\/|\/$/g, "");
  if (!pathname) return "homepage";
  return pathname.replace(/\//g, "-");
}

interface IngestionDeps {
  fetch: boolean;
  store: VectorStore;
  kbDir: string;
  sources: Source[];
  embedFn: (texts: string[]) => Promise<number[][]>;
  fetchPage?: (url: string) => Promise<string>;
}

export async function runIngestion(deps: IngestionDeps): Promise<void> {
  const {
    fetch: shouldFetch,
    store,
    kbDir,
    sources,
    embedFn,
    fetchPage,
  } = deps;
  const fetchedDir = resolve(kbDir, "fetched");
  const staticDir = resolve(kbDir, "static");
  await mkdir(fetchedDir, { recursive: true });
  await mkdir(staticDir, { recursive: true });

  if (shouldFetch) {
    if (!fetchPage) throw new Error("fetchPage required when --fetch is set");
    console.log("Fetching pages...");
    for (const source of sources) {
      if (!source.url || source.file) continue;
      const slug = urlToSlug(source.url);
      console.log(`  Fetching ${source.url} → ${slug}.md`);
      const markdown = await fetchPage(source.url);
      await Bun.write(resolve(fetchedDir, `${slug}.md`), markdown);
    }
  }

  let totalChunks = 0;
  const indexedSources: string[] = [];

  for (const source of sources) {
    const id = sourceId(source);
    const filePath = source.file
      ? resolve(staticDir, source.file)
      : resolve(fetchedDir, `${urlToSlug(id)}.md`);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      console.log(`  Skipping ${source.title} — no markdown file found`);
      continue;
    }

    const content = await file.text();
    const input: ChunkInput = {
      sourceUrl: id,
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

    await store.deleteBySourceUrl(id);
    await store.upsertChunks(chunksWithEmbeddings);
    indexedSources.push(id);

    console.log(`  ${source.title}: ${chunks.length} chunks`);
    totalChunks += chunks.length;
  }

  await store.deleteNotIn(indexedSources);

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

  initDb();

  const baseDir = import.meta.dirname ?? ".";
  const rootDir = resolve(baseDir, "../../..");
  const sourcesPath = resolve(rootDir, "../data/sources.json");
  const sources: Source[] = await Bun.file(sourcesPath).json();

  const store = new LibSQLVectorStore();
  const kbDir = resolve(rootDir, "../data/kb");

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
    kbDir,
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
