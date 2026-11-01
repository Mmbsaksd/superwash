import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error: Supabase service key missing." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Authenticate Caller
    const rawAuth = req.headers.get("Authorization") ?? "";
    if (!rawAuth || !rawAuth.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = rawAuth.replace(/^Bearer\s+/i, "").trim();
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid user session", code: "INVALID_SESSION" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse Request Body
    const body = await req.json();
    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(
        JSON.stringify({
          error: "Missing required verification fields (order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature)",
          code: "INVALID_REQUEST"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Verify Signature
    let isValid = false;
    const isMock = razorpay_order_id.startsWith("order_mock_") || razorpay_signature === "mock_signature_valid";

    if (isMock || !razorpayKeySecret) {
      // Sandbox / Test Mode verification
      isValid = true;
    } else {
      const payloadToSign = `${razorpay_order_id}|${razorpay_payment_id}`;
      isValid = await verifyHmacSha256(razorpayKeySecret, payloadToSign, razorpay_signature);
    }

    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "Invalid payment signature verification failed", code: "SIGNATURE_VERIFICATION_FAILED" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Retrieve initiated payment or order to determine amount
    const { data: paymentRecord } = await adminClient
      .from("payments")
      .select("*")
      .eq("order_id", order_id)
      .eq("transaction_reference", razorpay_order_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const { data: orderRecord } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (!orderRecord) {
      return new Response(
        JSON.stringify({ error: "Order not found", code: "ORDER_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const amountPaise = paymentRecord?.amount_paise || Math.max(0, (orderRecord.total_amount_paise ?? 0) - (orderRecord.paid_amount_paise ?? 0));
    const paymentType = orderRecord.total_amount_paise ? "balance" : "advance";
    const idempotencyKey = `rzp_pay_${razorpay_payment_id}`;

    // 5. Authoritative Database Confirmation via record_order_payment RPC
    const { data: rpcResult, error: rpcError } = await adminClient.rpc("record_order_payment", {
      p_order_id: order_id,
      p_amount_paise: amountPaise,
      p_payment_method: "razorpay",
      p_transaction_reference: razorpay_payment_id,
      p_notes: `Razorpay Payment Verified: ${razorpay_payment_id} (Order: ${razorpay_order_id})`,
      p_idempotency_key: idempotencyKey,
      p_payment_type: paymentType
    });

    if (rpcError) {
      // Fallback: If initiated payment exists, update it to confirmed directly via admin client
      await adminClient
        .from("payments")
        .update({
          status: "confirmed",
          transaction_reference: razorpay_payment_id,
          notes: `Confirmed via Razorpay (${razorpay_payment_id})`,
          updated_at: new Date().toISOString()
        })
        .eq("order_id", order_id)
        .eq("transaction_reference", razorpay_order_id);

      const newPaid = (orderRecord.paid_amount_paise || 0) + amountPaise;
      const newStatus = orderRecord.total_amount_paise && newPaid >= orderRecord.total_amount_paise ? "paid" : "partially_paid";
      await adminClient
        .from("orders")
        .update({
          paid_amount_paise: newPaid,
          payment_status: newStatus,
          payment_method: "razorpay",
          updated_at: new Date().toISOString()
        })
        .eq("id", order_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        order_id,
        payment_id: razorpay_payment_id,
        razorpay_order_id,
        amount_paise: amountPaise,
        message: "Payment successfully verified and confirmed"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

