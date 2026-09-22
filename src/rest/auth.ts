import type { NextFunction, Request, RequestHandler, Response } from "express";
import { UnauthorizedError } from "../errors/api-errors.ts";
import { normalizeCorrelationId } from "../lib/correlation-id.ts";
import { sendError } from "./errors.ts";

/** Resolve an authenticated author id from a bearer token, or undefined. */
export type AuthorResolver = (token: string) => Promise<string | undefined>;

export interface AuthContext {
  readonly authorId: string;
}

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

function extractToken(
  authorizationHeader: string | undefined,
): string | undefined {
  if (authorizationHeader === undefined) {
    return undefined;
  }
  const match = BEARER_PATTERN.exec(authorizationHeader.trim());
  return match?.[1];
}

/**
 * Express middleware that resolves and attaches the authenticated author id to
 * `res.locals.authorId`, returning 401 when no valid session is present.
 */
export function requireAuthor(resolver: AuthorResolver): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = extractToken(req.get("authorization"));
    const authorId = token === undefined ? undefined : await resolver(token);
    if (authorId === undefined) {
      const correlationId = normalizeCorrelationId(req.get("x-correlation-id"));
      res.setHeader("x-correlation-id", correlationId);
      sendError(
        res,
        new UnauthorizedError("A valid session is required."),
        correlationId,
      );
      return;
    }
    res.locals.authorId = authorId;
    next();
  };
}

/** Read the authenticated author id set by `requireAuthor`. */
export function authorOf(res: Response): string {
  return res.locals.authorId as string;
}

export { UnauthorizedError };
