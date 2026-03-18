import { getDb } from "../../lib/db.ts";
import { generateEmbedding } from "./embeddings.ts";
import { LibSQLVectorStore } from "./vector-store.ts";

const RELEVANCE_THRESHOLD = 0.7;

export interface KnowledgeSearchResult {
  sourceUrl: string;
  title: string;
  chunkIndex: number;
  content: string;
  score: number;
}

export async function searchKnowledge(
  query: string,
  topK = 5,
): Promise<KnowledgeSearchResult[]> {
  const store = new LibSQLVectorStore(getDb());
  const embedding = await generateEmbedding(query);
  const results = await store.search(embedding, topK);

  return results
    .filter((r) => r.distance < RELEVANCE_THRESHOLD)
    .map((r) => ({
      sourceUrl: r.sourceUrl,
      title: r.title,
      chunkIndex: r.chunkIndex,
      content: r.content,
      score: 1 - r.distance,
    }));
}
