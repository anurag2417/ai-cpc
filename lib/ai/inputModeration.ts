import { getOpenAI } from "@/lib/ai/openaiClient";
import { findPiiMatches, hasLikelyPii } from "@/lib/ai/piiPatterns";

export type InputModerationResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: string;
      layer: "regex_pii" | "openai_moderation";
      categories?: string[];
    };

const MODERATION_BLOCK_CATEGORIES = new Set([
  "sexual",
  "sexual/minors",
  "hate",
  "hate/threatening",
  "harassment",
  "harassment/threatening",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "violence",
  "violence/graphic",
  "illicit",
  "illicit/violent",
]);

/**
 * Regex / pattern layer: block obvious PII sharing in prompts (COPPA-adjacent safety).
 */
export function screenPromptForPii(text: string): InputModerationResult {
  if (!hasLikelyPii(text)) return { allowed: true };
  const kinds = findPiiMatches(text);
  return {
    allowed: false,
    reason: `Possible personal or sensitive identifiers detected (${kinds.join(", ")}). Remove addresses, emails, phone numbers, or ID numbers before continuing.`,
    layer: "regex_pii",
  };
}

/**
 * OpenAI Moderation API — violence, sexual content, hate, self-harm, etc.
 */
export async function moderatePromptWithOpenAI(
  text: string
): Promise<InputModerationResult> {
  const openai = getOpenAI();
  const res = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: text,
  });

  const result = res.results[0];
  if (!result) {
    return {
      allowed: false,
      reason: "Moderation service returned no result.",
      layer: "openai_moderation",
    };
  }

  if (!result.flagged) return { allowed: true };

  const flaggedCategories: string[] = [];
  const cats = result.categories as unknown as Record<
    string,
    boolean | null | undefined
  >;
  for (const key of Object.keys(cats)) {
    if (cats[key] && MODERATION_BLOCK_CATEGORIES.has(key)) {
      flaggedCategories.push(key);
    }
  }

  if (flaggedCategories.length === 0) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      "This message was blocked because it may include content that is not allowed (for example violence, sexual content, or harassment). Try rephrasing in a friendly, kid-safe way.",
    layer: "openai_moderation",
    categories: flaggedCategories,
  };
}

/**
 * Full input pipeline: regex PII first (fast), then OpenAI moderation.
 */
export async function moderateUserPrompt(
  text: string
): Promise<InputModerationResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      allowed: false,
      reason: "Message is empty.",
      layer: "regex_pii",
    };
  }

  const pii = screenPromptForPii(trimmed);
  if (!pii.allowed) return pii;

  return moderatePromptWithOpenAI(trimmed);
}
