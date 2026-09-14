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
