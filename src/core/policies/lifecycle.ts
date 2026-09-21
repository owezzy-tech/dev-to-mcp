import { InvalidInputError } from "../../errors/api-errors.ts";
import type { DraftState } from "../ports/article-repository.ts";

/**
 * Actor classes that can drive a workflow transition. `SCHEDULER` is
 * deliberately distinct from `AGENT` so scheduling authority can be
 * reasoned about — and blocked — independently of autonomous drafting.
 */
export const TRANSITION_ACTORS = [
  "AUTHOR",
  "AGENT",
  "SYSTEM",
  "SCHEDULER",
] as const;

export type TransitionActor = (typeof TRANSITION_ACTORS)[number];

export interface TransitionDefinition {
  readonly from: DraftState;
  readonly to: DraftState;
  /** Actor classes permitted to request this transition. */
  readonly actors: readonly TransitionActor[];
  /** True when the transition mutates DEV.to visibility/existence. */
  readonly publishes: boolean;
}

const AUTHOR_ONLY = ["AUTHOR"] as const;
const AUTHOR_OR_AGENT = ["AUTHOR", "AGENT"] as const;
const SYSTEM = ["SYSTEM"] as const;
const SCHEDULER = ["SCHEDULER"] as const;

/**
 * The complete approval-aware lifecycle. This table is the single source of
 * truth for both persistence and authorization: any transition not listed
 * here is rejected, and no edge into `PUBLISHING` is reachable by
 * `SCHEDULER`.
 */
export const LIFECYCLE_TRANSITIONS: readonly TransitionDefinition[] = [
  // Research and drafting phases may run autonomously.
  {
    from: "RESEARCHING",
    to: "IDEA_READY",
    actors: [...AUTHOR_OR_AGENT, ...SCHEDULER],
    publishes: false,
  },
  {
    from: "RESEARCHING",
    to: "NO_PUBLISH",
    actors: [...AUTHOR_OR_AGENT, ...SCHEDULER],
    publishes: false,
  },
  {
    from: "IDEA_READY",
    to: "DRAFTING",
    actors: [...AUTHOR_OR_AGENT, ...SCHEDULER],
    publishes: false,
  },
  {
    from: "IDEA_READY",
    to: "NO_PUBLISH",
    actors: [...AUTHOR_OR_AGENT, ...SCHEDULER],
    publishes: false,
  },
  {
    from: "DRAFTING",
    to: "DRAFT_READY",
    actors: [...AUTHOR_OR_AGENT],
    publishes: false,
  },
  {
    from: "DRAFTING",
    to: "DISCARDED",
    actors: [...AUTHOR_OR_AGENT],
    publishes: false,
  },
  {
    from: "DRAFT_READY",
    to: "AWAITING_APPROVAL",
    actors: [...AUTHOR_OR_AGENT],
    publishes: false,
  },
  {
    from: "DRAFT_READY",
    to: "DISCARDED",
    actors: [...AUTHOR_OR_AGENT],
    publishes: false,
  },
  {
    from: "DRAFT_READY",
    to: "NO_PUBLISH",
    actors: [...AUTHOR_OR_AGENT],
    publishes: false,
  },
  // The human decision gate: only the author may approve or reject.
  {
    from: "AWAITING_APPROVAL",
    to: "APPROVED",
    actors: [...AUTHOR_ONLY],
    publishes: false,
  },
  {
    from: "AWAITING_APPROVAL",
    to: "REJECTED",
    actors: [...AUTHOR_ONLY],
    publishes: false,
  },
  {
    from: "AWAITING_APPROVAL",
    to: "DRAFTING",
    actors: [...AUTHOR_OR_AGENT],
    publishes: false,
  },
  {
    from: "AWAITING_APPROVAL",
    to: "DISCARDED",
    actors: [...AUTHOR_OR_AGENT],
    publishes: false,
  },
  {
    from: "AWAITING_APPROVAL",
    to: "NO_PUBLISH",
    actors: [...AUTHOR_OR_AGENT],
    publishes: false,
  },
  // Rejection returns to revision rather than terminating the draft.
  {
    from: "REJECTED",
    to: "DRAFTING",
    actors: [...AUTHOR_OR_AGENT],
    publishes: false,
  },
  {
    from: "REJECTED",
    to: "DISCARDED",
    actors: [...AUTHOR_OR_AGENT],
    publishes: false,
  },
  // An edit after approval invalidates the approval and returns to drafting.
  {
    from: "APPROVED",
    to: "DRAFTING",
    actors: [...AUTHOR_OR_AGENT],
    publishes: false,
  },
  {
    from: "APPROVED",
    to: "DISCARDED",
    actors: [...AUTHOR_OR_AGENT],
    publishes: false,
  },
  // Publishing is the only visibility-changing edge. Scheduler is absent.
  {
    from: "APPROVED",
    to: "PUBLISHING",
    actors: [...AUTHOR_ONLY],
    publishes: true,
  },
  {
    from: "APPROVED",
    to: "NO_PUBLISH",
    actors: [...AUTHOR_ONLY],
    publishes: false,
  },
  {
    from: "PUBLISHING",
    to: "PUBLISHED",
    actors: [...AUTHOR_OR_AGENT, ...SYSTEM],
    publishes: true,
  },
  {
    from: "PUBLISHING",
    to: "FAILED",
    actors: [...AUTHOR_OR_AGENT, ...SYSTEM],
    publishes: false,
  },
  // Recoverable failure may retry the exact same approved version.
  {
    from: "FAILED",
    to: "PUBLISHING",
    actors: [...AUTHOR_OR_AGENT],
    publishes: true,
  },
  {
    from: "FAILED",
    to: "DRAFTING",
    actors: [...AUTHOR_OR_AGENT],
    publishes: false,
  },
  {
    from: "FAILED",
    to: "DISCARDED",
    actors: [...AUTHOR_OR_AGENT],
    publishes: false,
  },
];

/** States from which no further transition is permitted. */
export const TERMINAL_STATES: readonly DraftState[] = [
  "PUBLISHED",
  "DISCARDED",
  "NO_PUBLISH",
];

export function isTerminalState(state: DraftState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function findTransition(
  from: DraftState,
  to: DraftState,
): TransitionDefinition | undefined {
  return LIFECYCLE_TRANSITIONS.find(
    (transition) => transition.from === from && transition.to === to,
  );
}

export function canTransition(
  from: DraftState,
  to: DraftState,
  actor: TransitionActor,
): boolean {
  const transition = findTransition(from, to);
  return transition !== undefined && transition.actors.includes(actor);
}

/**
 * Rejects an illegal transition with an actionable, safe message. The message
 * names only lifecycle states and actor classes, never draft content.
 */
export function assertTransition(
  from: DraftState,
  to: DraftState,
  actor: TransitionActor,
): TransitionDefinition {
  const transition = findTransition(from, to);
  if (transition === undefined) {
    throw new InvalidInputError(
      `Illegal draft transition: ${from} cannot move to ${to}.`,
    );
  }
  if (!transition.actors.includes(actor)) {
    throw new InvalidInputError(
      `A ${actor} actor cannot move a draft from ${from} to ${to}.`,
    );
  }
  return transition;
}

/**
 * Guards the publish boundary specifically. Scheduler-triggered workflows may
 * research and prepare drafts but must never reach a publishing transition.
 */
export function assertPublishAuthority(
  from: DraftState,
  to: DraftState,
  actor: TransitionActor,
): TransitionDefinition {
  const transition = assertTransition(from, to, actor);
  if (transition.publishes && actor === "SCHEDULER") {
    throw new InvalidInputError(
      "A scheduler cannot authorize a publish transition.",
    );
  }
  return transition;
}

export function allowedTransitions(
  from: DraftState,
  actor: TransitionActor,
): readonly DraftState[] {
  return LIFECYCLE_TRANSITIONS.filter(
    (transition) =>
      transition.from === from && transition.actors.includes(actor),
  ).map((transition) => transition.to);
}
