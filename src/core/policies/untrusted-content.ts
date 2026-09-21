/**
 * A string of third-party provenance. The `untrusted` flag is nominal: code
 * that consumes retrieval output must treat it as data, never as instructions
 * (FR-014, SEC-005/006). This wrapper keeps that boundary explicit so hostile
 * article/comment text cannot flow into a trusted instruction context by
 * accident.
 */
export interface UntrustedText {
  readonly untrusted: true;
  readonly value: string;
}

export function untrusted(value: string): UntrustedText {
  return { untrusted: true, value };
}

/** Read the text for data-only use (display, logging, judgment state). */
export function untrustedValue(content: UntrustedText): string {
  return content.value;
}

/**
 * True when a string carries instruction-like framing. Used defensively to
 * detect hostile retrieved content; the primary guarantee remains structural
 * (retrieved content is never evaluated as instructions).
 */
export function looksInstructional(content: UntrustedText): boolean {
  const text = content.value.toLowerCase();
  const directives = [
    "ignore previous",
    "ignore prior",
    "ignore the above",
    "you are now",
    "forget your",
    "disregard",
    "override your",
    "system prompt",
    "you must",
    "do not follow",
  ];
  return directives.some((directive) => text.includes(directive));
}
