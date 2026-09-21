const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const VERIFY_MARKER =
  /\[(?:VERIFY|verification needed|needs verification|verify)\]/gi;

/** Extract source references (markdown link URLs) from a draft. */
export function extractCitations(markdown: string): readonly string[] {
  const citations: string[] = [];
  for (const match of markdown.matchAll(MARKDOWN_LINK)) {
    const url = match[1];
    if (url !== undefined) {
      citations.push(url);
    }
  }
  return citations;
}

/** Count explicit verification markers on uncited claims. */
export function countVerificationMarkers(markdown: string): number {
  return markdown.match(VERIFY_MARKER)?.length ?? 0;
}
