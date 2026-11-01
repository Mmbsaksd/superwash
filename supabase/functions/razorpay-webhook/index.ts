import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

async function verifyHmacSha256(secret: string, data: string, signatureHex: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const hex = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.toLowerCase() === signatureHex.toLowerCase();
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response("Server configuration error", { status: 500 });
    }

    const rawSignature = req.headers.get("x-razorpay-signature") ?? "";
    const rawBody = await req.text();

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const isValid = await verifyHmacSha256(webhookSecret, rawBody, rawSignature);
      if (!isValid) {
        return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event;
    const paymentEntity = event.payload?.payment?.entity;

    if (!paymentEntity) {
      return new Response(JSON.stringify({ status: "ignored_no_payment_entity" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const razorpayPaymentId = paymentEntity.id;
    const razorpayOrderId = paymentEntity.order_id;
    const amountPaise = paymentEntity.amount;
    const orderId = paymentEntity.notes?.order_id;

    if (eventType === "payment.captured" || eventType === "order.paid") {
      // 1. Idempotency Check: Already processed?
      const { data: existingPayment } = await adminClient
        .from("payments")
        .select("id, status")
        .eq("transaction_reference", razorpayPaymentId)
        .eq("status", "confirmed")
        .limit(1)
        .single();

      if (existingPayment) {
        return new Response(JSON.stringify({ status: "already_processed" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // 2. Identify target order
      let targetOrderId = orderId;
      if (!targetOrderId && razorpayOrderId) {
        const { data: initiated } = await adminClient
          .from("payments")
          .select("order_id")
          .eq("transaction_reference", razorpayOrderId)
          .limit(1)
          .single();
        targetOrderId = initiated?.order_id;
      }

      if (!targetOrderId) {
        return new Response(JSON.stringify({ status: "order_not_identifiable" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // 3. Confirm payment in ledger via RPC
      const idempotencyKey = `rzp_wh_${razorpayPaymentId}`;
      await adminClient.rpc("record_order_payment", {
        p_order_id: targetOrderId,
        p_amount_paise: amountPaise,
        p_payment_method: "razorpay",
        p_transaction_reference: razorpayPaymentId,
        p_notes: `Confirmed via Razorpay Webhook (${eventType})`,
        p_idempotency_key: idempotencyKey,
        p_payment_type: "full"
      });

      return new Response(JSON.stringify({ status: "confirmed", payment_id: razorpayPaymentId }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (eventType === "payment.failed") {
      if (razorpayOrderId) {
        await adminClient
          .from("payments")
          .update({
            status: "failed",
            notes: `Payment failed: ${paymentEntity.error_description || "Declined by gateway"}`,
            updated_at: new Date().toISOString()
          })
          .eq("transaction_reference", razorpayOrderId);
      }

      return new Response(JSON.stringify({ status: "failure_recorded" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ status: "unhandled_event", event: eventType }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Webhook processing error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

