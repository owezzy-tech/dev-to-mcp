import type { GenerationProvider } from "../../core/ports/generation-provider.ts";
import { UpstreamPayloadError } from "../../errors/api-errors.ts";
import { HttpClient } from "../../lib/http-client.ts";

export interface OpenAICompatibleGenerationOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly httpClient: HttpClient;
}

interface ChatCompletionResponse {
  readonly choices: readonly {
    readonly message: { readonly content: string | null };
  }[];
}

/**
 * OpenAI-compatible chat-completions generator. The API key is server-side
 * only and never appears in prompts, logs, or generated content.
 */
export class OpenAICompatibleGenerationProvider implements GenerationProvider {
  private readonly options: OpenAICompatibleGenerationOptions;

  readonly model: string;

  constructor(options: OpenAICompatibleGenerationOptions) {
    this.options = options;
    this.model = options.model;
  }

  async generate(system: string, user: string): Promise<string> {
    const url = new URL("/v1/chat/completions", this.options.baseUrl);
    const response = (await this.options.httpClient.request(url, {
      correlationId: "generation",
      endpoint: "chat-completions",
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body: {
        model: this.options.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
    })) as ChatCompletionResponse;

    const content = response.choices[0]?.message.content;
    if (content === undefined || content === null) {
      throw new UpstreamPayloadError();
    }
    return content;
  }
}
