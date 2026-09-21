import type {
  Embedding,
  EmbeddingProvider,
} from "../../core/ports/embedding-provider.ts";
import { HttpClient } from "../../lib/http-client.ts";

export interface OpenAICompatibleEmbeddingOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly dimensions: number;
  readonly httpClient: HttpClient;
}

interface EmbeddingsResponse {
  readonly data: readonly { readonly embedding: readonly number[] }[];
}

/**
 * OpenAI-compatible `/v1/embeddings` provider. Configured server-side only;
 * the API key never leaves this adapter and never appears in logs or results.
 */
export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  private readonly options: OpenAICompatibleEmbeddingOptions;

  readonly model: string;

  readonly dimensions: number;

  constructor(options: OpenAICompatibleEmbeddingOptions) {
    this.options = options;
    this.model = options.model;
    this.dimensions = options.dimensions;
  }

  async embed(texts: readonly string[]): Promise<readonly Embedding[]> {
    if (texts.length === 0) {
      return [];
    }
    const url = new URL("/v1/embeddings", this.options.baseUrl);
    const response = (await this.options.httpClient.request(url, {
      correlationId: "embedding",
      endpoint: "embeddings",
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body: {
        model: this.options.model,
        input: texts,
      },
    })) as EmbeddingsResponse;

    return response.data.map((entry) => entry.embedding);
  }
}
