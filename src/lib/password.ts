import { randomInt } from "node:crypto";

const LOWER = "abcdefghijkmnpqrstuvwxyz"; // no l/o to avoid 1/0 confusion
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#%*+";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

function pick(charset: string): string {
  return charset[randomInt(charset.length)];
}

/** A random 12-character temporary password with at least one of each class. */
export function generateTempPassword(): string {
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: 8 }, () => pick(ALL));
  const chars = [...required, ...rest];
  // Fisher-Yates shuffle so the required chars aren't always in the same spot
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
