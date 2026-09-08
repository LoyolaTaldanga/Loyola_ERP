// Parses class labels from the Class-wise sheet ("CLASS : XII SC", "CLASS :
// U.K.G. A", "CLASS : NURSERY") and decodes the short class-codes used in the
// Teacher-wise sheet ("XII S", "IX D", "VIIIC" typo-for-"VIII C") against a
// registry of classes actually found in the Class-wise sheet — so decoding
// only ever resolves to a class/section that's known to exist.

export const GRADE_ORDER = [
  "Nursery",
  "LKG",
  "UKG",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
];

// Longest-first so "XII" is tried before "XI", "X" before nothing, etc.
const NUMERAL_PREFIXES = ["XII", "XI", "X", "IX", "VIII", "VII", "VI", "IV", "V", "III", "II", "I"];

const STREAM_CODE_TO_NAME: Record<string, string> = { SC: "Science", COM: "Commerce", ARTS: "Arts" };
const STREAM_LETTER_TO_NAME: Record<string, string> = { S: "Science", C: "Commerce", A: "Arts" };

export interface ParsedClassLabel {
  className: string;
  stream: string | null;
  // XI/XII stream classes have no real section letter — a stream is
  // modeled as one section, named "A", to satisfy sections.name.
  section: string;
}

export function parseClassLabel(raw: string): ParsedClassLabel {
  let label = raw
    .replace(/^CLASS\s*:\s*/i, "")
    .trim()
    .replace(/U\.?\s*K\.?\s*G\.?/i, "UKG")
    .replace(/L\.?\s*K\.?\s*G\.?/i, "LKG");

  if (/^NURSERY$/i.test(label)) {
    return { className: "Nursery", stream: null, section: "A" };
  }

  const parts = label.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1]?.toUpperCase() ?? "";
  const first = parts[0]?.toUpperCase() ?? "";

  if ((first === "XI" || first === "XII") && STREAM_CODE_TO_NAME[last]) {
    return { className: first, stream: STREAM_CODE_TO_NAME[last], section: "A" };
  }

  const className = parts.slice(0, -1).join(" ").toUpperCase();
  return { className, stream: null, section: last };
}

interface RegistryEntry {
  className: string;
  stream: string | null;
  section: string | null;
}

/** Registry of classes/sections actually parsed from the Class-wise sheet. */
export class ClassCodeRegistry {
  private byKey = new Map<string, RegistryEntry>();

  register(entry: RegistryEntry) {
    this.byKey.set(this.keyFor(entry), entry);
  }

  private keyFor(entry: RegistryEntry): string {
    if (entry.stream) {
      const letter = Object.entries(STREAM_LETTER_TO_NAME).find(([, name]) => name === entry.stream)?.[0];
      return `${entry.className}${letter}`;
    }
    if (entry.className === "Nursery") return "NUR";
    return `${entry.className}${entry.section}`;
  }

  get(key: string): RegistryEntry | undefined {
    return this.byKey.get(key);
  }

  /**
   * Decodes a teacher-wise class-code cell into one or more registry keys.
   * Returns null if the code can't be confidently resolved (bare grade with
   * no section/stream, a multi-grade range, or anything else ambiguous) —
   * callers should treat that as "needs manual review", not guess.
   */
  decode(raw: string): string[] | null {
    let text = raw
      .replace(/\bWITH\b.*/i, "")
      .trim()
      .toUpperCase();
    if (!text) return null;

    if (text === "NUR") return this.get("NUR") ? ["NUR"] : null;

    const ukgLkgMatch = text.match(/^(UKG|LKG)\s*([A-Z])$/);
    if (ukgLkgMatch) {
      const key = `${ukgLkgMatch[1]}${ukgLkgMatch[2]}`;
      return this.get(key) ? [key] : null;
    }

    if (text.includes("/")) {
      const [left, right] = text.split("/", 2).map((s) => s.replace(/\s+/g, ""));
      const prefix = NUMERAL_PREFIXES.find((p) => left.startsWith(p));
      if (!prefix) return null;
      const leftLetter = left.slice(prefix.length);
      const rightLetter = right; // right side reuses the same grade prefix
      if (!/^[A-Z]$/.test(leftLetter) || !/^[A-Z]$/.test(rightLetter)) return null;
      const keyLeft = `${prefix}${leftLetter}`;
      const keyRight = `${prefix}${rightLetter}`;
      const resolved = [keyLeft, keyRight].filter((k) => this.get(k));
      return resolved.length > 0 ? resolved : null;
    }

    const compact = text.replace(/\s+/g, "");
    const prefix = NUMERAL_PREFIXES.find((p) => compact.startsWith(p));
    if (!prefix) return null;
    const rest = compact.slice(prefix.length);
    if (!/^[A-Z]$/.test(rest)) return null; // bare grade, or a stray typo we won't guess at
    const key = `${prefix}${rest}`;
    return this.get(key) ? [key] : null;
  }
}
