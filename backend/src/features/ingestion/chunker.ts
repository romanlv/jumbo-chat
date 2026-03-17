import { createHash } from "node:crypto";

export interface ChunkInput {
  sourceUrl: string;
  title: string;
  priority: number;
  content: string;
}

export interface Chunk {
  chunkId: string;
  sourceUrl: string;
  title: string;
  priority: number;
  chunkIndex: number;
  content: string;
}

export interface ChunkOptions {
  targetSize?: number;
  overlapSize?: number;
  minSize?: number;
}

function makeChunkId(sourceUrl: string, chunkIndex: number): string {
  return createHash("sha256")
    .update(`${sourceUrl}:${chunkIndex}`)
    .digest("hex")
    .slice(0, 16);
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s/.test(line);
}

export function chunkDocument(
  input: ChunkInput,
  options?: ChunkOptions,
): Chunk[] {
  const targetSize = options?.targetSize ?? 500;
  const overlapSize = options?.overlapSize ?? 50;
  const minSize = options?.minSize ?? 250;

  const { sourceUrl, title, priority, content } = input;
  const trimmed = content.trim();
  if (!trimmed) return [];

  const paragraphs = trimmed
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: Chunk[] = [];
  let buffer = "";
  let overlapPrefix = "";

  function flush() {
    const text = (overlapPrefix ? `${overlapPrefix}…\n\n` : "") + buffer;
    if (text.trim()) {
      chunks.push({
        chunkId: makeChunkId(sourceUrl, chunks.length),
        sourceUrl,
        title,
        priority,
        chunkIndex: chunks.length,
        content: text.trim(),
      });
      overlapPrefix = buffer.trim().slice(-overlapSize);
    }
    buffer = "";
  }

  for (const paragraph of paragraphs) {
    const wouldOverflow =
      buffer && buffer.length + paragraph.length + 2 > targetSize;

    // Prefer breaking before headings, or when buffer would overflow
    if (buffer && (wouldOverflow || isHeading(paragraph))) {
      flush();
    }

    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }

  // Flush remaining
  if (buffer.trim()) {
    if (chunks.length > 0 && buffer.trim().length < minSize) {
      const last = chunks[chunks.length - 1] as Chunk;
      last.content += `\n\n${buffer.trim()}`;
    } else {
      flush();
    }
  }

  return chunks;
}
