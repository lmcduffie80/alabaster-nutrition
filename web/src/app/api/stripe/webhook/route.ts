import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { handleStripeEvent, verifyStripeEvent } from "@/lib/server/billing";

/** Stripe calls this when a subscription starts, renews, fails, or ends. */
export async function POST(request: NextRequest) {
  const event = verifyStripeEvent(await request.text(), request.headers.get("stripe-signature"));
  if (!event) {
    console.warn("Refused a Stripe webhook with a missing or bad signature.");
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }
  await handleStripeEvent(await getDb(), event);
  return NextResponse.json({ received: true });
}
