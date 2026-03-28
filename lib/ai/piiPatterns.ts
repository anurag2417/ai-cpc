/**
 * Lightweight regex screens for obvious PII in user prompts (defense in depth with API moderation).
 * Tune for your locale; false positives are possible on technical text.
 */

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const US_PHONE =
  /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const CREDIT_CARD = /\b(?:\d[ -]*?){13,19}\b/;
const STREET_ADDRESS =
  /\b\d{1,5}\s+[\w\s]{1,40}(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr)\b/i;

export type PiiMatchKind =
  | "email"
  | "phone"
  | "ssn"
  | "credit_card"
  | "street_address";

export function findPiiMatches(text: string): PiiMatchKind[] {
  const found: PiiMatchKind[] = [];
  if (EMAIL.test(text)) found.push("email");
  if (US_PHONE.test(text)) found.push("phone");
  if (SSN.test(text)) found.push("ssn");
  if (CREDIT_CARD.test(text)) found.push("credit_card");
  if (STREET_ADDRESS.test(text)) found.push("street_address");
  return found;
}

export function hasLikelyPii(text: string): boolean {
  return findPiiMatches(text).length > 0;
}
