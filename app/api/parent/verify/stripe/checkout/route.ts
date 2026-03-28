import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/env/baseUrl";
import { getStripe } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe is not configured (STRIPE_SECRET_KEY)." },
      { status: 503 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const base = getAppBaseUrl();
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: 50,
          product_data: {
            name: "Parent identity verification",
            description:
              "One-time $0.50 card charge to verify you are an adult for COPPA-style parental consent.",
          },
        },
        quantity: 1,
      },
    ],
    client_reference_id: user.id,
    metadata: { supabase_user_id: user.id },
    success_url: `${base}/parent/verify?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/parent/verify?canceled=1`,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Could not create Checkout session." },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: session.url });
}
