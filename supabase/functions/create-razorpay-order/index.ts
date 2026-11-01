import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          error: "Server configuration error: Supabase service key missing.",
          code: "SERVER_CONFIG_ERROR"
        }),
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

    // 2. Parse Body
    const body = await req.json();
    const { order_id, amount_paise } = body;

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "Missing order_id parameter", code: "INVALID_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Retrieve Order
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("*, profiles:customer_id(full_name, phone, email)")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Order not found", code: "ORDER_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (order.order_status === "cancelled") {
      return new Response(
        JSON.stringify({ error: "Cannot create payment for a cancelled order", code: "ORDER_CANCELLED" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authorization: User must own the order or be operational staff/admin/owner
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const userRole = profile?.role || "customer";
    const isStaff = ["owner", "manager", "delivery", "admin"].includes(userRole);
    if (!isStaff && order.customer_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized access to order", code: "FORBIDDEN" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Check Business Settings for Online Payment Status
    const { data: settings } = await adminClient.from("business_settings").select("*").limit(1).single();
    if (settings && settings.online_payment_enabled === false && !isStaff) {
      return new Response(
        JSON.stringify({
          error: "Online payments via Razorpay are currently disabled by store settings.",
          code: "ONLINE_PAYMENTS_DISABLED"
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Calculate Charge Amount
    const totalPayable = order.total_amount_paise ?? 0;
    const paidAmount = order.paid_amount_paise ?? 0;
    const balanceDue = Math.max(0, totalPayable - paidAmount);

    let chargePaise = amount_paise ? Number(amount_paise) : balanceDue;
    if (chargePaise <= 0) {
      // If order has not been weighed yet, check advance requirement
      if (settings?.advance_payment_enabled) {
        if (settings.advance_payment_type === "percentage" && settings.advance_payment_percentage) {
          const estRate = order.price_per_kg_paise || 7900;
          const minWt = order.min_weight_kg || 1.0;
          chargePaise = Math.round(estRate * minWt * (settings.advance_payment_percentage / 100));
        } else {
          chargePaise = settings.advance_payment_amount_paise || 0;
        }
      }
    }

    if (chargePaise <= 0) {
      return new Response(
        JSON.stringify({ error: "Order has zero balance due or has not yet been weighed", code: "ZERO_BALANCE" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Create Razorpay Order
    let razorpayOrderId = "";
    let isMock = false;

    if (razorpayKeyId && razorpayKeySecret) {
      const authHeader = "Basic " + btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
      const rzpResp = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: chargePaise,
          currency: "INR",
          receipt: `rcpt_${order.order_number}`,
          notes: {
            order_id: order.id,
            order_number: order.order_number,
            customer_id: order.customer_id
          }
        })
      });

      if (!rzpResp.ok) {
        const errData = await rzpResp.json();
        return new Response(
          JSON.stringify({ error: "Razorpay order creation failed", details: errData }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rzpData = await rzpResp.json();
      razorpayOrderId = rzpData.id;
    } else {
      // Development Sandbox / Mock Mode
      isMock = true;
      razorpayOrderId = `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }

    // 6. Record Initiated Payment in Ledger
    const idempotencyKey = `rzp_init_${razorpayOrderId}`;
    await adminClient.from("payments").insert({
      order_id: order.id,
      amount_paise: chargePaise,
      payment_method: "razorpay",
      payment_type: order.total_amount_paise ? "balance" : "advance",
      status: "initiated",
      transaction_reference: razorpayOrderId,
      notes: `Razorpay Order initiated (${isMock ? "Sandbox Mock" : "Gateway Live"})`,
      idempotency_key: idempotencyKey,
      recorded_by: user.id
    });

    return new Response(
      JSON.stringify({
        success: true,
        razorpay_order_id: razorpayOrderId,
        amount_paise: chargePaise,
        currency: "INR",
        key_id: razorpayKeyId || "rzp_test_mock_sandbox",
        is_mock: isMock,
        order_number: order.order_number,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone
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

