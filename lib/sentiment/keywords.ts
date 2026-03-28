export type SentimentAlertKind = "high_distress" | "loneliness";

export type SentimentScanResult = {
  kind: SentimentAlertKind;
  matchedTerms: string[];
};

const DISTRESS_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bkill\s+myself\b/i, label: "kill myself" },
  { pattern: /\bwant\s+to\s+die\b/i, label: "want to die" },
  { pattern: /\b(end\s+it\s+all|no\s+reason\s+to\s+live)\b/i, label: "hopelessness" },
  { pattern: /\b(can\s*not|can't)\s+go\s+on\b/i, label: "cannot go on" },
  { pattern: /\bhurts\s+me\s+so\s+much\b/i, label: "emotional pain" },
  { pattern: /\bi\s+hate\s+my\s+life\b/i, label: "hate my life" },
  { pattern: /\b(nobody\s+cares|no\s+one\s+cares)\b/i, label: "nobody cares" },
  { pattern: /\bwish\s+i\s+(was|were)\s+dead\b/i, label: "wish death" },
];

const LONELINESS_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bi\s+have\s+no\s+friends\b/i, label: "no friends" },
  { pattern: /\b(so\s+)?lonely\b/i, label: "lonely" },
  { pattern: /\b(nobody\s+talks\s+to|no\s+one\s+talks\s+to)\s+me\b/i, label: "ignored" },
  { pattern: /\bfeel\s+invisible\b/i, label: "invisible" },
  { pattern: /\bno\s+one\s+understands\s+me\b/i, label: "misunderstood" },
  { pattern: /\bi\s+have\s+nobody\b/i, label: "have nobody" },
  { pattern: /\bleft\s+out\b/i, label: "left out" },
];

function collectMatches(
  text: string,
  patterns: { pattern: RegExp; label: string }[]
): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const { pattern, label } of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(lower)) hits.push(label);
  }
  return hits;
}

/**
 * Keyword-based screening (not clinical diagnosis). Use for caregiver alerts only.
 */
export function scanChildMessageForSentiment(
  text: string
): SentimentScanResult[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const out: SentimentScanResult[] = [];

  const distress = collectMatches(trimmed, DISTRESS_PATTERNS);
  if (distress.length > 0) {
    out.push({ kind: "high_distress", matchedTerms: distress });
  }

  const loneliness = collectMatches(trimmed, LONELINESS_PATTERNS);
  if (loneliness.length > 0) {
    out.push({ kind: "loneliness", matchedTerms: loneliness });
  }

  return out;
}
