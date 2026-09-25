import { InvalidInputError } from "../../errors/api-errors.ts";

/**
 * Rejects identifiers that the Forem API cannot resolve. Kept out of the
 * public MCP schemas so the published JSON Schema stays unchanged.
 */
export function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new InvalidInputError(`${label} must be a positive integer.`);
  }
  return value;
}

/**
 * Normalizes an article path to `username/slug`. Accepts the leading slash
 * Forem returns in `article.path`, and rejects anything else so dot segments
 * cannot redirect the request to a different Forem endpoint.
 */
export function requireArticlePath(value: string): string {
  const segments = value.replace(/^\//, "").split("/");
  const valid =
    segments.length === 2 &&
    segments.every((s) => s !== "" && s !== "." && s !== "..");
  if (!valid) {
    throw new InvalidInputError(
      'Article path must look like "username/article-slug".',
    );
  }
  return segments.join("/");
}
