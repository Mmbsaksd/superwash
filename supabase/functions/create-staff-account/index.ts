import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ 
          error: "[HTTP 500] Server configuration error: Supabase admin credentials missing.",
          status: 500,
          code: "SERVER_CONFIG_ERROR"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize trusted Admin Client with service-role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Authenticate caller and verify 'owner' role
    const rawAuth = req.headers.get("Authorization") ?? "";
    if (!rawAuth || !rawAuth.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({ 
          error: "[HTTP 401] Missing authorization bearer token. Please log in again.",
          status: 401,
          code: "MISSING_AUTH_HEADER"
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = rawAuth.replace(/^Bearer\s+/i, "").trim();

    // Reject empty tokens or unauthenticated anonymous client calls
    if (!token || token === supabaseAnonKey) {
      return new Response(
        JSON.stringify({ 
          error: "[HTTP 401] Invalid or expired session. Anonymous access is not permitted for staff administration.",
          status: 401,
          code: "ANONYMOUS_TOKEN_REJECTED",
          details: "A valid authenticated owner session token is required."
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authoritative user validation via Supabase Auth
    const { data: { user: callerUser }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !callerUser) {
      const status = callerError?.status || 401;
      const isExpired = callerError?.message?.toLowerCase().includes("expired");
      const safeMessage = isExpired
        ? "Your session has expired. Please log in again."
        : (callerError?.message || "Invalid or expired session. Please log in again.");

      return new Response(
        JSON.stringify({ 
          error: `[HTTP ${status}] ${safeMessage}`,
          status: status,
          code: isExpired ? "SESSION_EXPIRED" : "INVALID_SESSION",
          details: callerError?.message || "User authentication token could not be verified."
        }),
        { status: status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller role in public.profiles (by ID or verified email)
    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role, is_active, email")
      .eq("id", callerUser.id)
      .maybeSingle();

    if (profileError) {
      return new Response(
        JSON.stringify({
          error: `[HTTP 500] Database error retrieving caller profile: ${profileError.message}`,
          status: 500,
          code: "DATABASE_PROFILE_QUERY_FAILED",
          details: profileError.message
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let profile = callerProfile;
    if (!profile && callerUser.email) {
      const { data: profileByEmail, error: emailError } = await adminClient
        .from("profiles")
        .select("id, role, is_active, email")
        .ilike("email", callerUser.email.trim().toLowerCase())
        .maybeSingle();

      if (emailError) {
        return new Response(
          JSON.stringify({
            error: `[HTTP 500] Database error retrieving caller profile by email: ${emailError.message}`,
            status: 500,
            code: "DATABASE_PROFILE_QUERY_FAILED",
            details: emailError.message
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      profile = profileByEmail;
    }

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: `[HTTP 403] Access denied: No profile record found for authenticated user (${callerUser.email || callerUser.id}).`,
          status: 403,
          code: "PROFILE_NOT_FOUND",
          details: "A public.profiles record with the active 'owner' role is required."
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile.is_active === false) {
      return new Response(
        JSON.stringify({
          error: "[HTTP 403] Access denied: Your owner account is currently deactivated. Please contact support.",
          status: 403,
          code: "ACCOUNT_DEACTIVATED",
          details: `Account (${profile.email || profile.id}) is marked inactive.`
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile.role !== "owner") {
      return new Response(
        JSON.stringify({
          error: `[HTTP 403] Access denied: Only authenticated users with the active 'owner' role can create staff accounts. Current role: '${profile.role}'.`,
          status: 403,
          code: "FORBIDDEN_NOT_OWNER",
          details: `Authenticated user (${callerUser.email || callerUser.id}) has role '${profile.role}', which does not have permission to manage staff.`
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse and validate payload
    const body = await req.json();
    const { full_name, email, phone, role, password, send_invite } = body;

    const cleanEmail = email?.trim()?.toLowerCase();
    const cleanPhone = phone?.replace(/[^0-9]/g, "")?.slice(-10);
    const cleanName = full_name?.trim();

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return new Response(
        JSON.stringify({ error: "A valid email address is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!cleanName || cleanName.length < 2) {
      return new Response(
        JSON.stringify({ error: "Full name must be at least 2 characters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!cleanPhone || cleanPhone.length !== 10) {
      return new Response(
        JSON.stringify({ error: "Please enter a valid 10-digit Indian mobile number." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!role || !["manager", "delivery"].includes(role)) {
      return new Response(
        JSON.stringify({ error: "Operational role must be either 'manager' or 'delivery'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Prevent duplicate accounts (both by email and by phone)
    const { data: existingEmailProfile } = await adminClient
      .from("profiles")
      .select("id, email, full_name, role")
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (existingEmailProfile) {
      return new Response(
        JSON.stringify({
          error: `An account with email ${cleanEmail} already exists (${existingEmailProfile.full_name}, ${existingEmailProfile.role.toUpperCase()}).`,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingPhoneProfile } = await adminClient
      .from("profiles")
      .select("id, phone, full_name, role")
      .eq("phone", cleanPhone)
      .maybeSingle();

    if (existingPhoneProfile) {
      return new Response(
        JSON.stringify({
          error: `A staff member with phone number ${cleanPhone} already exists (${existingPhoneProfile.full_name}).`,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Create user in Supabase Auth via Admin API
    let authUser: any;
    let newUserId: string;

    if (password && password.trim().length >= 8) {
      // Direct initial password setup with confirmed email
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password: password.trim(),
        email_confirm: true,
        user_metadata: {
          full_name: cleanName,
          phone: cleanPhone,
          role: role,
        },
      });

      if (createError) {
        return new Response(
          JSON.stringify({ error: `Auth account creation failed: ${createError.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      authUser = createData.user;
      newUserId = createData.user.id;
    } else {
      // Invite user flow via Admin API
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        cleanEmail,
        {
          data: {
            full_name: cleanName,
            phone: cleanPhone,
            role: role,
          },
          redirectTo: `${req.headers.get("origin") || ""}/login`,
        }
      );

      if (inviteError) {
        // Fallback: If custom SMTP is not enabled, create confirmed user with secure one-time secret and send reset email
        const autoPassword = crypto.randomUUID() + "SuperWash@2026";
        const { data: fallbackData, error: fallbackError } = await adminClient.auth.admin.createUser({
          email: cleanEmail,
          password: autoPassword,
          email_confirm: true,
          user_metadata: {
            full_name: cleanName,
            phone: cleanPhone,
            role: role,
          },
        });

        if (fallbackError) {
          return new Response(
            JSON.stringify({ error: `Auth account creation failed: ${fallbackError.message}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Trigger password reset email via built-in auth
        await adminClient.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${req.headers.get("origin") || ""}/login`,
        });

        authUser = fallbackData.user;
        newUserId = fallbackData.user.id;
      } else {
        authUser = inviteData.user;
        newUserId = inviteData.user.id;
      }
    }

    // 5. Link new Auth user to public.profiles with the authoritative operational role
    const nowIso = new Date().toISOString();
    const { error: upsertError } = await adminClient
      .from("profiles")
      .upsert({
        id: newUserId,
        email: cleanEmail,
        full_name: cleanName,
        phone: cleanPhone,
        role: role,
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      });

    if (upsertError) {
      // Rollback newly created Auth user to prevent orphaned / inconsistent accounts
      try {
        await adminClient.auth.admin.deleteUser(newUserId);
      } catch (delErr) {
        console.error("Failed to rollback auth user:", delErr);
      }
      return new Response(
        JSON.stringify({ error: `Failed to link staff profile: ${upsertError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Staff account successfully created for ${cleanName} (${role.toUpperCase()}) with email ${cleanEmail}.`,
        profile: {
          id: newUserId,
          email: cleanEmail,
          full_name: cleanName,
          phone: cleanPhone,
          role: role,
          is_active: true,
          created_at: nowIso,
        },
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "An unexpected error occurred while creating staff account." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
