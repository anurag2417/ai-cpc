import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ageBandSchema = z.enum([
  "under_5",
  "age_5_7",
  "age_8_10",
  "age_11_12",
  "age_13_15",
  "age_16_17",
]);

const bodySchema = z.object({
  age_band: ageBandSchema,
  display_ordinal: z.number().int().min(1).max(99).optional(),
  preferred_locale: z
    .string()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
    .optional()
    .nullable(),
});

/**
 * Creates a child profile. RLS also requires is_parent_verified; this route returns a clear error first.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: parent, error: parentError } = await supabase
    .from("parent_profiles")
    .select("is_parent_verified")
    .eq("id", user.id)
    .maybeSingle();

  if (parentError) {
    return NextResponse.json(
      { error: "Failed to load parent profile", detail: parentError.message },
      { status: 500 }
    );
  }

  if (!parent?.is_parent_verified) {
    return NextResponse.json(
      {
        error: "parent_not_verified",
        message:
          "Complete verifiable parental consent before adding a child profile.",
      },
      { status: 403 }
    );
  }

  const body = parsed.data;

  const { data: highest } = await supabase
    .from("child_profiles")
    .select("display_ordinal")
    .eq("parent_id", user.id)
    .order("display_ordinal", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrdinal = (highest?.display_ordinal ?? 0) + 1;
  const displayOrdinal = body.display_ordinal ?? nextOrdinal;

  const row = {
    parent_id: user.id,
    age_band: body.age_band,
    display_ordinal: displayOrdinal,
    preferred_locale: body.preferred_locale ?? null,
  };

  const { data: child, error } = await supabase
    .from("child_profiles")
    .insert(row)
    .select("id, age_band, display_ordinal, preferred_locale, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "insert_failed", detail: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ child });
}
