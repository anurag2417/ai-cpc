import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type VerificationMethod = "stripe_card" | "kba";

/**
 * Server-only: sets VPC flags on `parent_profiles` (service role).
 */
export async function markParentVerified(
  userId: string,
  method: VerificationMethod
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { error } = await supabase.from("parent_profiles").upsert(
    {
      id: userId,
      is_parent_verified: true,
      parent_verified_at: now,
      verification_method: method,
      updated_at: now,
    },
    { onConflict: "id" }
  );

  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}
