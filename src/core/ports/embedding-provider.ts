/** A dense numeric vector produced by an embedding model. */
export type Embedding = readonly number[];

/**
 * Provider-neutral embedding interface (FR-010). Implementations turn text
 * into fixed-dimension vectors that pgvector indexes. The OpenAI-compatible
 * adapter is the default; a null provider lets retrieval run with full-text
 * ranking only.
 */
export interface EmbeddingProvider {
  /** Model identifier recorded alongside stored vectors for traceability. */
  readonly model: string;
  /** Fixed vector dimension this provider emits. */
  readonly dimensions: number;
  /** Embed a batch of texts, returning one vector per input in order. */
  embed(texts: readonly string[]): Promise<readonly Embedding[]>;
}

/** Embedding provider that yields nothing, for unconfigured deployments. */
export const NULL_EMBEDDING_PROVIDER: EmbeddingProvider = {
  model: "none",
  dimensions: 0,
  async embed(_texts: readonly string[]): Promise<readonly Embedding[]> {
    return [];
  },
};

export function isNullEmbeddingProvider(provider: EmbeddingProvider): boolean {
  return provider === NULL_EMBEDDING_PROVIDER || provider.dimensions === 0;
}
