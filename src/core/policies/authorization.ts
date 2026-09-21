import { ForbiddenError } from "../../errors/api-errors.ts";

export const CAPABILITIES = ["READ", "DRAFT_WRITE", "PUBLISH"] as const;

export type Capability = (typeof CAPABILITIES)[number];

export function hasCapability(
  granted: readonly Capability[],
  required: Capability,
): boolean {
  return granted.includes(required);
}

export function assertCapability(
  granted: readonly Capability[],
  required: Capability,
): void {
  if (!hasCapability(granted, required)) {
    throw new ForbiddenError(`Missing required capability: ${required}.`);
  }
}
