/**
 * Strict system prompts from child profile fields (age band + interest).
 * Aligns with `child_age_band` in the DB; optional `ageYears` disambiguates 8 vs 9–10 in `age_8_10`.
 */

export type ChildAgeBand =
  | "under_5"
  | "age_5_7"
  | "age_8_10"
  | "age_11_12"
  | "age_13_15"
  | "age_16_17";

export type PersonaTier = "teacher_5_8" | "co_explorer_9_12" | "co_explorer_teen";

export type GenerateChildSystemPromptInput = {
  ageBand: ChildAgeBand;
  /** Optional; use to split `age_8_10` between 5–8 (Teacher) and 9–12 (Co-explorer). */
  ageYears?: number;
  /** Non-PII interest label (e.g. "space", "drawing"). Empty falls back to neutral wording. */
  interest: string;
};

const MAX_INTEREST_LEN = 120;

function sanitizeInterest(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ").slice(0, MAX_INTEREST_LEN);
  return t.length > 0 ? t : "things they are curious about";
}

/**
 * Maps coarse band (+ optional years) to Teacher (5–8) vs Co-explorer (9–12+).
 */
export function resolvePersonaTier(input: {
  ageBand: ChildAgeBand;
  ageYears?: number;
}): PersonaTier {
  const { ageBand, ageYears } = input;

  if (ageBand === "under_5" || ageBand === "age_5_7") {
    return "teacher_5_8";
  }

  if (ageBand === "age_8_10") {
    if (ageYears === undefined) return "teacher_5_8";
    return ageYears <= 8 ? "teacher_5_8" : "co_explorer_9_12";
  }

  if (ageBand === "age_11_12") {
    return "co_explorer_9_12";
  }

  return "co_explorer_teen";
}

function forbiddenBlock(): string {
  return [
    "Hard prohibitions (no exceptions):",
    "- Do not act as or imply you are a medical professional, therapist, or source of medical, mental-health, or diagnostic advice. If asked, say a trusted adult or doctor should help.",
    "- Do not act as or imply you are a lawyer or legal authority. Do not give legal advice; suggest a parent, guardian, or qualified professional for legal questions.",
  ].join("\n");
}

function teacherBlock(interestPhrase: string): string {
  return [
    "Persona: You are a warm, patient Teacher for a young learner (about ages 5–8).",
    "Language:",
    "- Use simple, concrete vocabulary and short sentences.",
    "- Avoid complex metaphors, idioms, sarcasm, and abstract jargon.",
    "- Prefer one clear idea per sentence.",
    `Interest: The learner enjoys "${interestPhrase}". Use this only to pick friendly examples and encouragement—do not claim to know private details about the child.`,
  ].join("\n");
}

function coExplorer912Block(interestPhrase: string): string {
  return [
    "Persona: You are a Co-explorer (about ages 9–12): curious, encouraging, and collaborative.",
    "Tone:",
    "- Be inquisitive: invite questions, wonder aloud, and explore ideas together.",
    "- You may use light, clear analogies when helpful; avoid dense or literary metaphors.",
    `Interest: The learner is interested in "${interestPhrase}". Ground examples in this theme when it fits; stay general and do not invent personal facts.`,
  ].join("\n");
}

function coExplorerTeenBlock(interestPhrase: string): string {
  return [
    "Persona: You are a Co-explorer for a teen: collaborative, respectful, and clear.",
    "Tone:",
    "- Stay inquisitive and exploratory; invite reasoning and follow-up questions.",
    "- Use clear explanations; avoid talking down. Skip ornate metaphors unless they aid understanding.",
    `Interest: "${interestPhrase}" is a stated interest—use it for relevant examples only, without assuming private details.`,
  ].join("\n");
}

/**
 * Returns a single system message string: persona rules + interest + global prohibitions.
 */
export function generateChildSystemPrompt(
  input: GenerateChildSystemPromptInput
): string {
  const interestPhrase = sanitizeInterest(input.interest);
  const tier = resolvePersonaTier({
    ageBand: input.ageBand,
    ageYears: input.ageYears,
  });

  const core =
    tier === "teacher_5_8"
      ? teacherBlock(interestPhrase)
      : tier === "co_explorer_9_12"
        ? coExplorer912Block(interestPhrase)
        : coExplorerTeenBlock(interestPhrase);

  return [core, "", forbiddenBlock()].join("\n");
}
