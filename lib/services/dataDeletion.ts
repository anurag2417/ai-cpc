import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const deleteChildDataResultSchema = z.object({
  ok: z.boolean(),
  audit_id: z.string().uuid().optional(),
  error: z.string().optional(),
  detail: z.string().optional(),
});

export type DeleteChildDataResult =
  | { ok: true; auditId: string }
  | { ok: false; error: string; detail?: string };

/**
 * COPPA / GDPR-K aligned erasure: removes the child row and all dependent rows
 * (conversations, messages, child_event_logs) via FK CASCADE, and records audit.
 *
 * Call only after verifying the requesting parent owns `parentId` (e.g. session
 * or signed parent token). Uses the service role RPC `delete_child_data`.
 */
export async function deleteChildData(
  parentId: string,
  childId: string
): Promise<DeleteChildDataResult> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc("delete_child_data", {
    p_parent_id: parentId,
    p_child_id: childId,
  });

  if (error) {
    return {
      ok: false,
      error: "rpc_error",
      detail: error.message,
    };
  }

  const parsed = deleteChildDataResultSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_response",
      detail: parsed.error.message,
    };
  }

  const row = parsed.data;
  if (!row.ok) {
    return {
      ok: false,
      error: row.error ?? "unknown",
      detail: row.detail,
    };
  }

  if (!row.audit_id) {
    return { ok: false, error: "missing_audit_id" };
  }

  return { ok: true, auditId: row.audit_id };
}

/** Named service object for dependency injection or route handlers. */
export const dataDeletionService = { deleteChildData };
