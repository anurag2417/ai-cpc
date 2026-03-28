import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyKbaAnswers } from "@/lib/vpc/kbaVerify";
import { markParentVerified } from "@/lib/vpc/markParentVerified";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  q1: z.string().min(1).max(500),
  q2: z.string().min(1).max(500),
  q3: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  if (!process.env.VPC_KBA_EXPECTED_HASH?.trim()) {
    return NextResponse.json(
      {
        error: "kba_not_configured",
        message:
          "Set VPC_KBA_EXPECTED_HASH and VPC_KBA_HASH_SALT on the server, or use Stripe verification.",
      },
      { status: 503 }
    );
  }

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

  const { q1, q2, q3 } = parsed.data;
  const ok = verifyKbaAnswers([q1, q2, q3]);
  if (!ok) {
    return NextResponse.json(
      { error: "verification_failed", message: "Answers could not be verified." },
      { status: 403 }
    );
  }

  const result = await markParentVerified(user.id, "kba");
  if (!result.ok) {
    return NextResponse.json(
      { error: "persist_failed", detail: result.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, method: "kba" });
}
