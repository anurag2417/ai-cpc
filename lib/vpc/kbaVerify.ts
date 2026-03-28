import { createHash } from "node:crypto";

/**
 * Placeholder KBA: compares SHA-256 of salted answers to `VPC_KBA_EXPECTED_HASH`.
 * Replace with a real identity / KBA vendor (e.g. LexisNexis, Alloy) in production.
 *
 * Generate expected hash (example):
 *   salt="demo"; answers=["a","b","c"]
 *   payload = `${salt}|${norm(a)}|${norm(b)}|${norm(c)}`
 *   expected = sha256(payload) hex
 */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function verifyKbaAnswers(answers: [string, string, string]): boolean {
  const expected = process.env.VPC_KBA_EXPECTED_HASH?.trim();
  if (!expected) {
    return false;
  }

  const salt = process.env.VPC_KBA_HASH_SALT ?? "";
  const normalized: [string, string, string] = [
    normalize(answers[0]),
    normalize(answers[1]),
    normalize(answers[2]),
  ];
  const payload = [salt, ...normalized].join("|");
  const hash = createHash("sha256").update(payload, "utf8").digest("hex");
  return hash === expected;
}
