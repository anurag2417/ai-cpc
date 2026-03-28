import { getOpenAI } from "@/lib/ai/openaiClient";

export type OutputGuardrailResult = {
  ok: boolean;
  /** Text safe to send to the client (may be a fallback). */
  text: string;
  /** Non-blocking signals (e.g. overconfident phrasing). */
  warnings: string[];
  /** Blocked by moderation or hard safety rules. */
  blocked: boolean;
  blockReason?: string;
};

const SAFE_FALLBACK =
  "I can’t share a good answer to that right now. Please ask a grown-up or try a different question.";

/** Overconfident / false-certainty phrases — heuristic only, not proof of hallucination. */
const HALLUCINATION_HINTS = [
  /\b100%\s+(certain|sure|accurate|correct)\b/i,
  /\bguaranteed\s+(to|that)\b/i,
  /\bI\s+(know|remember)\s+for\s+a\s+fact\b/i,
  /\babsolutely\s+(certain|sure)\b/i,
  /\btrust\s+me\b.*\b(always|never)\b/i,
  /\bdefinitely\s+happened\b/i,
  /\bI\s+was\s+there\s+when\b/i,
];

/** Rough profanity / strong language — extend for your locale. */
const AGE_INAPPROPRIATE = [
  /\b(fuck|shit|bitch|damn|asshole|crap)\b/i,
  /\b(sex\s*nude|porn|xxx)\b/i,
];

const OUTPUT_MODERATION_FLAG = new Set([
  "sexual",
  "sexual/minors",
  "violence",
  "violence/graphic",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
]);

function scanHallucinationRedFlags(text: string): string[] {
  const warnings: string[] = [];
  for (const re of HALLUCINATION_HINTS) {
    if (re.test(text)) {
      warnings.push("overconfident_or_unverifiable_claim");
      break;
    }
  }
  if (/\bhttps?:\/\/[^\s]+\b/i.test(text)) {
    warnings.push("contains_urls_verify_with_adult");
  }
  return warnings;
}

function scanAgeInappropriateLanguage(text: string): boolean {
  return AGE_INAPPROPRIATE.some((re) => re.test(text));
}

/**
 * OpenAI moderation on model output — blocks sexual/violence/self-harm in responses.
 */
export async function moderateOutputWithOpenAI(
  text: string
): Promise<{ flagged: boolean; categories: string[] }> {
  const openai = getOpenAI();
  const res = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: text,
  });
  const result = res.results[0];
  if (!result?.flagged) return { flagged: false, categories: [] };

  const categories: string[] = [];
  const cats = result.categories as unknown as Record<
    string,
    boolean | null | undefined
  >;
  for (const key of Object.keys(cats)) {
    if (cats[key] && OUTPUT_MODERATION_FLAG.has(key)) categories.push(key);
  }
  return { flagged: categories.length > 0, categories };
}

export type GuardrailOptions = {
  /** When true, prepend a short reminder if hallucination-style warnings fire. */
  prependReminderOnWarnings?: boolean;
};

/**
 * Parses assistant text: API moderation, age-inappropriate regex, and hallucination heuristics.
 * Use the returned `text` field for the client.
 */
export async function guardrailLLMOutput(
  rawAssistantText: string,
  options: GuardrailOptions = {}
): Promise<OutputGuardrailResult> {
  const prependReminder = options.prependReminderOnWarnings ?? true;
  const warnings: string[] = [];

  const mod = await moderateOutputWithOpenAI(rawAssistantText);
  if (mod.flagged) {
    return {
      ok: false,
      text: SAFE_FALLBACK,
      warnings: mod.categories.map((c) => `moderation:${c}`),
      blocked: true,
      blockReason: "output_moderation",
    };
  }

  if (scanAgeInappropriateLanguage(rawAssistantText)) {
    return {
      ok: false,
      text: SAFE_FALLBACK,
      warnings: ["age_inappropriate_language"],
      blocked: true,
      blockReason: "age_inappropriate_language",
    };
  }

  warnings.push(...scanHallucinationRedFlags(rawAssistantText));

  let text = rawAssistantText;
  if (prependReminder && warnings.length > 0) {
    text =
      "Remember: double-check important facts with a teacher or parent.\n\n" +
      rawAssistantText;
  }

  return {
    ok: true,
    text,
    warnings,
    blocked: false,
  };
}
