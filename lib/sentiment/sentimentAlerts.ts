import type { SupabaseClient } from "@supabase/supabase-js";
import { scanChildMessageForSentiment } from "@/lib/sentiment/keywords";

export type RecordSentimentParams = {
  parentId: string;
  childId: string;
  conversationId: string | null;
  messageId: string | null;
  userText: string;
};

/**
 * Inserts rows into `sentiment_alerts` for matched keyword categories.
 */
export async function recordSentimentAlertsFromChildMessage(
  supabase: SupabaseClient,
  params: RecordSentimentParams
): Promise<{ inserted: number }> {
  const hits = scanChildMessageForSentiment(params.userText);
  if (hits.length === 0) return { inserted: 0 };

  let inserted = 0;
  for (const hit of hits) {
    const { error } = await supabase.from("sentiment_alerts").insert({
      parent_id: params.parentId,
      child_id: params.childId,
      conversation_id: params.conversationId,
      message_id: params.messageId,
      alert_kind: hit.kind,
      matched_terms: hit.matchedTerms,
    });
    if (error) {
      console.error("[sentiment_alerts]", error.message);
    } else {
      inserted += 1;
    }
  }

  return { inserted };
}
