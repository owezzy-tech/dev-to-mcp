import { timingSafeEqual } from "node:crypto";

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

export function verifyBearerToken(
  authorizationHeader: string | undefined,
  expectedToken: string,
): boolean {
  if (authorizationHeader === undefined) {
    return false;
  }
  const match = BEARER_PATTERN.exec(authorizationHeader.trim());
  if (match === null || match[1] === undefined) {
    return false;
  }

  const presented = Buffer.from(match[1], "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  if (presented.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(presented, expected);
}
