const HONORIFIC_WORDS = new Set(["MR", "MRS", "MS", "MISS", "SR", "FR", "FATHER", "DR", "SISTER"]);

/**
 * "MS. NIDHI SINGH" -> "nidhi.singh"; "SR. SHANTA BAXLA" -> "shanta.baxla";
 * also handles the source data's inconsistent "MR.RAJESH PATHAK" (no space
 * after the honorific's period) -> "rajesh.pathak", not "mr.pathak".
 */
export function usernameBase(fullName: string): string {
  const name = fullName
    .trim()
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = name.split(" ").filter(Boolean);
  while (words.length > 1 && HONORIFIC_WORDS.has(words[0].toUpperCase())) {
    words.shift();
  }

  const parts = words.map((w) => w.toLowerCase().replace(/[^a-z]/g, "")).filter(Boolean);

  if (parts.length === 0) return "teacher";
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts[parts.length - 1]}`;
}

export const SYNTHETIC_EMAIL_DOMAIN = "loyolataldanga.internal";

export function syntheticEmailFor(username: string): string {
  return `${username}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

/** Appends 2, 3, 4... to the base until `isTaken` says it's free. */
export async function generateUniqueUsername(
  fullName: string,
  isTaken: (candidate: string) => Promise<boolean>
): Promise<string> {
  const base = usernameBase(fullName);
  let candidate = base;
  let suffix = 1;
  while (await isTaken(candidate)) {
    suffix++;
    candidate = `${base}${suffix}`;
  }
  return candidate;
}
