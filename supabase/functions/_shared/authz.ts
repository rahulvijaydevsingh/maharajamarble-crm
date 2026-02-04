import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createUserClient(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: req.headers.get("Authorization") || "",
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireAdmin(req: Request) {
  const userClient = createUserClient(req);
  const { data: sessionData, error: sessionError } = await userClient.auth.getUser();
  if (sessionError || !sessionData?.user) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const { data: isAdmin, error: adminErr } = await (userClient.rpc as any)("is_admin");
  if (adminErr) {
    return { ok: false as const, status: 500, error: adminErr.message };
  }
  if (!isAdmin) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return {
    ok: true as const,
    userId: sessionData.user.id,
    userEmail: sessionData.user.email || null,
  };
}
