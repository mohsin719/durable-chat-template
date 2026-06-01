import { createHash, randomInt } from "node:crypto";

const PUBLIC_ID_MIN = 10000;
const PUBLIC_ID_MAX = 99999;

export function generatePublicIdCandidate(): string {
  const n = randomInt(PUBLIC_ID_MIN, PUBLIC_ID_MAX + 1);
  return `USR-${n}`;
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
