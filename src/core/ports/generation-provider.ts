import { InternalError } from "../../errors/api-errors.ts";

/**
 * Provider-neutral generative text interface. Used for idea generation and
 * Markdown drafting, which require free-text output — unlike the judgment
 * provider (Jev), which returns typed probabilities only. The
 * OpenAI-compatible chat adapter is the default.
 */
export interface GenerationProvider {
  /** Model identifier recorded for traceability. */
  readonly model: string;
  /** Generate text from a system prompt and a user prompt. */
  generate(system: string, user: string): Promise<string>;
}

/** Placeholder for unconfigured deployments; every call throws. */
export const NULL_GENERATION_PROVIDER: GenerationProvider = {
  model: "none",
  async generate(): Promise<string> {
    throw new InternalError();
  },
};

export function isNullGenerationProvider(
  provider: GenerationProvider,
): boolean {
  return provider === NULL_GENERATION_PROVIDER;
}
