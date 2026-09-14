import { createHash } from "node:crypto";

export function hashContent(markdown: string): string {
  return createHash("sha256").update(markdown, "utf8").digest("hex");
}
