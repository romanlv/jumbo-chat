import type { Client } from "@libsql/client";

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
  initialize(): Promise<void>;
  upsertChunks(chunks: ChunkWithEmbedding[]): Promise<void>;
  search(embedding: number[], topK?: number): Promise<VectorSearchResult[]>;
  deleteBySourceUrl(sourceUrl: string): Promise<void>;
}

export class LibSQLVectorStore implements VectorStore {
  constructor(private client: Client) {}

  async initialize(): Promise<void> {
    await this.client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS documents (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        chunk_id TEXT NOT NULL UNIQUE,
        source_url TEXT NOT NULL,
        title TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 2,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding F32_BLOB(1536),
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents(libsql_vector_idx(embedding));
      CREATE INDEX IF NOT EXISTS idx_documents_source_url ON documents(source_url);
    `);
  }

  async upsertChunks(chunks: ChunkWithEmbedding[]): Promise<void> {
    if (chunks.length === 0) return;

    const tx = await this.client.transaction("write");
    try {
      for (const chunk of chunks) {
        await tx.execute({
          sql: `INSERT OR REPLACE INTO documents
            (chunk_id, source_url, title, priority, chunk_index, content, embedding, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, vector32(?), ?)`,
          args: [
            chunk.chunkId,
            chunk.sourceUrl,
            chunk.title,
            chunk.priority,
            chunk.chunkIndex,
            chunk.content,
            JSON.stringify(chunk.embedding),
            new Date().toISOString(),
          ],
        });
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async search(embedding: number[], topK = 5): Promise<VectorSearchResult[]> {
    const result = await this.client.execute({
      sql: `SELECT
        d.chunk_id,
        d.source_url,
        d.title,
        d.priority,
        d.chunk_index,
        d.content,
        vector_distance_cos(d.embedding, vector32(?)) AS distance
      FROM vector_top_k('idx_documents_embedding', vector32(?), ?) AS v
      JOIN documents AS d ON d.rowid = v.id
      ORDER BY distance`,
      args: [JSON.stringify(embedding), JSON.stringify(embedding), topK],
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
    await this.client.execute({
      sql: "DELETE FROM documents WHERE source_url = ?",
      args: [sourceUrl],
    });
  }
}
