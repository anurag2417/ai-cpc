import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("sentiment_alerts")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("parent_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to dismiss alert", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
