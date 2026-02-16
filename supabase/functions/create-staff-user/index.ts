import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  validateEmail, 
  validatePassword, 
  validateFullName, 
  validatePhone, 
  validateRole 
} from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get the authorization header to verify the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Verify the requesting user is an admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Check if requesting user is admin (direct query bypasses auth.uid() issue in RPC)
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .single();
    const roleData = roleRow?.role;
    if (roleData !== "super_admin" && roleData !== "admin") {
      return new Response(
        JSON.stringify({ error: "Only admins can create staff members" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const body = await req.json();

    // Validate all inputs
    const emailResult = validateEmail(body.email);
    if (!emailResult.success) {
      return new Response(
        JSON.stringify({ error: emailResult.error }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const passwordResult = validatePassword(body.password);
    if (!passwordResult.success) {
      return new Response(
        JSON.stringify({ error: passwordResult.error }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const fullNameResult = validateFullName(body.full_name);
    if (!fullNameResult.success) {
      return new Response(
        JSON.stringify({ error: fullNameResult.error }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const phoneResult = validatePhone(body.phone);
    if (!phoneResult.success) {
      return new Response(
        JSON.stringify({ error: phoneResult.error }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const roleResult = validateRole(body.role);
    if (!roleResult.success) {
      return new Response(
        JSON.stringify({ error: roleResult.error }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const email = emailResult.data!;
    const password = passwordResult.data!;
    const full_name = fullNameResult.data!;
    const phone = phoneResult.data;
    const role = roleResult.data!;

    // Create the user
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!newUser.user) {
      return new Response(
        JSON.stringify({ error: "Failed to create user" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Create profile
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: newUser.user.id,
        email,
        full_name,
        phone: phone || null,
        is_active: true,
      });

    if (profileError) {
      console.error("Profile error:", profileError);
    }

    // Assign role
    const { error: roleError } = await supabase
      .from("user_roles")
      .upsert({
        user_id: newUser.user.id,
        role,
      }, {
        onConflict: "user_id",
      });

    if (roleError) {
      console.error("Role error:", roleError);
    }

    console.log(`Staff user created: ${email} with role ${role} by admin ${requestingUser.email}`);

    return new Response(
      JSON.stringify({ success: true, user_id: newUser.user.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
