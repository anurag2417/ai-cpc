import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { markParentVerified } from "@/lib/vpc/markParentVerified";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Confirms Checkout after redirect (backup if webhook is delayed). Idempotent.
 */
export async function GET(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe is not configured." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    return NextResponse.json(
      { error: "payment_not_complete", status: session.payment_status },
      { status: 400 }
    );
  }

  const uid =
    session.metadata?.supabase_user_id ?? session.client_reference_id ?? null;
  if (!uid || uid !== user.id) {
    return NextResponse.json({ error: "session_user_mismatch" }, { status: 403 });
  }

  const result = await markParentVerified(user.id, "stripe_card");
  if (!result.ok) {
    return NextResponse.json(
      { error: "persist_failed", detail: result.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, method: "stripe_card" });
}
