// Both timetable Excel files use free-text subject labels with real-world
// inconsistencies (typos, abbreviation vs. full name, spacing/punctuation
// variants). This normalizes the obvious cases so we don't create duplicate
// `subjects` rows for the same subject, while leaving genuinely distinct
// fine-grained labels (e.g. per-language reading/writing/vocabulary drills)
// alone rather than guessing they're the same thing.

// Exact-match corrections for known typos / punctuation variants observed
// in the source files (keys are post-whitespace-collapse, uppercased).
const TYPO_FIXES: Record<string, string> = {
  "E,APPLICATION": "E.APPLICATION",
  "E,LANG": "E.LANG",
  "E,LIT": "E.LIT",
  "M,APTITUDE": "M.APTITUDE",
  "SANSKEIT": "SANSKRIT",
  "COMPUTER9P)": "COMPUTER(P)",
  "H.VOCABULATY": "H.VOCABULARY",
  "H.VOC/WRITING": "H.VOC/WRITING",
  "H/B WRITING": "H/B.WRITING",
  "E.VOC; WRITING": "E.VOC/WRITING",
  "E. STORY": "E.STORY",
  "G.K": "G.K.",
  "HIN 3 L": "HIN 3L",
  "POL. SCIENCE": "POLITICAL SCIENCE",
  "POL.SC": "POLITICAL SCIENCE",
  "POL SC": "POLITICAL SCIENCE",
};

// Whole-string abbreviation expansions (only applied on an exact match, so
// they never corrupt a longer label that happens to start the same way).
const ABBREVIATIONS: Record<string, string> = {
  ECO: "ECONOMICS",
  PHY: "PHYSICS",
  CHEM: "CHEMISTRY",
  GEO: "GEOGRAPHY",
};

const GAMES_SUBJECTS = new Set(["GAMES", "P.T.", "P.T", "INDOOR GAMES"]);

export interface NormalizedSubject {
  name: string;
  category: "academic" | "games";
  isPractical: boolean;
}

export function normalizeSubject(raw: string): NormalizedSubject | null {
  let text = raw.trim().replace(/\s+/g, " ");
  if (!text) return null;

  let isPractical = false;

  // Practical suffix: "PHY - P", "CHEM - P", "COMP/BIO - P"
  const dashPMatch = text.match(/^(.*?)\s*-\s*P$/i);
  if (dashPMatch) {
    isPractical = true;
    text = dashPMatch[1].trim();
  }
  // "COMPUTER(P)" / "COMPUTER9P)" (typo) style
  const parenPMatch = text.match(/^(.*?)[(9]P\)$/i);
  if (parenPMatch) {
    isPractical = true;
    text = parenPMatch[1].trim();
  }
  if (/^(PRACTICALS?|SCIENCE LAB|COMP\.?\s*LAB|LAB)$/i.test(text)) {
    isPractical = true;
  }

  text = text.toUpperCase();
  // Normalize a leading "X, WORD" abbreviation style to "X.WORD"
  text = text.replace(/^([A-Z]),\s*/, "$1.");
  text = TYPO_FIXES[text] ?? text;
  text = ABBREVIATIONS[text] ?? text;

  if (!text) return null;

  return {
    name: text,
    category: GAMES_SUBJECTS.has(text) ? "games" : "academic",
    isPractical,
  };
}
