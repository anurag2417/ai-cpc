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

  const { data: profile, error } = await supabase
    .from("parent_profiles")
    .select("is_parent_verified, parent_verified_at, verification_method")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load profile", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    userId: user.id,
    is_parent_verified: profile?.is_parent_verified ?? false,
    parent_verified_at: profile?.parent_verified_at ?? null,
    verification_method: profile?.verification_method ?? null,
  });
}
