import { eq } from "drizzle-orm";
import { documents } from "../../db/schema.ts";
import { db } from "../../lib/db.ts";

export interface ChunkWithEmbedding {
  chunkId: string;
  sourceUrl: string;
  title: string;
  priority: number;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

export interface VectorSearchResult {
  chunkId: string;
  sourceUrl: string;
  title: string;
  priority: number;
  chunkIndex: number;
  content: string;
  distance: number;
}

export interface VectorStore {
  upsertChunks(chunks: ChunkWithEmbedding[]): Promise<void>;
  search(embedding: number[], topK?: number): Promise<VectorSearchResult[]>;
  deleteBySourceUrl(sourceUrl: string): Promise<void>;
}

export class LibSQLVectorStore implements VectorStore {
  async upsertChunks(chunks: ChunkWithEmbedding[]): Promise<void> {
    if (chunks.length === 0) return;

    const tx = await db.$client.transaction("write");
    try {
      for (const chunk of chunks) {
        const now = new Date().toISOString();
        await tx.execute({
          sql: `INSERT OR REPLACE INTO documents
            (chunk_id, source_url, title, priority, chunk_index, content, embedding, updated_at)
            VALUES (:chunkId, :sourceUrl, :title, :priority, :chunkIndex, :content, vector32(:embedding), :updatedAt)`,
          args: {
            chunkId: chunk.chunkId,
            sourceUrl: chunk.sourceUrl,
            title: chunk.title,
            priority: chunk.priority,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            embedding: JSON.stringify(chunk.embedding),
            updatedAt: now,
          },
        });
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async search(embedding: number[], topK = 5): Promise<VectorSearchResult[]> {
    const vec = JSON.stringify(embedding);
    const result = await db.$client.execute({
      sql: `SELECT
        d.chunk_id,
        d.source_url,
        d.title,
        d.priority,
        d.chunk_index,
        d.content,
        vector_distance_cos(d.embedding, vector32(:vec)) AS distance
      FROM vector_top_k('idx_documents_embedding', vector32(:vec), :topK) AS v
      JOIN documents AS d ON d.rowid = v.id`,
      args: { vec, topK },
    });

    return result.rows.map((row) => ({
      chunkId: row.chunk_id as string,
      sourceUrl: row.source_url as string,
      title: row.title as string,
      priority: row.priority as number,
      chunkIndex: row.chunk_index as number,
      content: row.content as string,
      distance: row.distance as number,
    }));
  }

  async deleteBySourceUrl(sourceUrl: string): Promise<void> {
    await db.delete(documents).where(eq(documents.sourceUrl, sourceUrl));
  }
}
