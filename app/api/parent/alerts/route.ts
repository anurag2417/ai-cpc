import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("sentiment_alerts")
    .select(
      "id, alert_kind, matched_terms, dismissed_at, created_at, child_id"
    )
    .eq("parent_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load alerts", detail: error.message },
      { status: 500 }
    );
  }

  const childIds = [...new Set((rows ?? []).map((r) => r.child_id))];
  const ordinals: Record<string, number> = {};

  if (childIds.length > 0) {
    const { data: children } = await supabase
      .from("child_profiles")
      .select("id, display_ordinal")
      .in("id", childIds);

    for (const c of children ?? []) {
      ordinals[c.id] = c.display_ordinal;
    }
  }

  const alerts =
    rows?.map((row) => ({
      id: row.id,
      alert_kind: row.alert_kind,
      matched_terms: row.matched_terms,
      dismissed_at: row.dismissed_at,
      created_at: row.created_at,
      child_id: row.child_id,
      child_display_ordinal: ordinals[row.child_id] ?? null,
    })) ?? [];

  return NextResponse.json({ alerts });
}
