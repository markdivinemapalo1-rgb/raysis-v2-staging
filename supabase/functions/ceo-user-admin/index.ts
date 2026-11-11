// Raysis V2 CEO user administration Edge Function
// Deploy with Supabase CLI. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as function secrets.
// The service-role key must never be placed in index.html or sent to the browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!url || !serviceKey || !token) return reply({ error: "Function configuration or sign-in missing" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return reply({ error: "Invalid session" }, 401);

  const { data: caller, error: profileError } = await admin
    .from("profiles").select("role").eq("id", authData.user.id).single();
  if (profileError || caller?.role !== "ceo") return reply({ error: "CEO access required" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400); }
  const writeAdminAudit = async (actionName: string, recordId: string, branchName: string | null, detail: Record<string, unknown>) => {
    const { error } = await admin.from("audit_logs").insert({
      actor_id: authData.user.id, branch_name: branchName, table_name: "profiles",
      record_id: recordId, action: actionName, new_data: detail,
    });
    if (error) console.error("Could not write CEO administration audit row:", error.message);
  };

  const action = body.action;

  if (action === "list") {
    const { data, error } = await admin.from("profiles")
      .select("id,full_name,role,branch_name,created_at").order("created_at");
    if (error) return reply({ error: error.message }, 400);
    const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) return reply({ error: usersError.message }, 400);
    const byId = new Map(users.users.map((u) => [u.id, u]));
    return reply({ users: (data || []).map((p) => ({
      ...p, email: byId.get(p.id)?.email || "", disabled: Boolean(byId.get(p.id)?.banned_until &&
        new Date(byId.get(p.id)!.banned_until!).getTime() > Date.now()),
    })) });
  }

  if (action === "create") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const full_name = String(body.full_name || "").trim();
    const role = String(body.role || "");
    const branch_name = role === "ceo" ? null : String(body.branch_name || "");
    if (!email || password.length < 10 || !full_name || !["ceo", "branch_user"].includes(role) ||
        (role === "branch_user" && !["Mansa", "Chinsali"].includes(branch_name))) {
      return reply({ error: "Provide valid name, email, password (10+ characters), role and branch" }, 400);
    }
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) return reply({ error: error?.message || "Could not create account" }, 400);
    const { error: insertError } = await admin.from("profiles").insert({
      id: data.user.id, full_name, role, branch_name,
    });
    if (insertError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return reply({ error: "Profile creation failed: " + insertError.message }, 400);
    }
    await writeAdminAudit("CEO_CREATE_USER", data.user.id, branch_name, { email, full_name, role, branch_name });
    return reply({ created: true, user_id: data.user.id });
  }

  if (action === "update") {
    const userId = String(body.user_id || "");
    const full_name = String(body.full_name || "").trim();
    const role = String(body.role || "");
    const branch_name = role === "ceo" ? null : String(body.branch_name || "");
    if (!userId || !full_name || !["ceo", "branch_user"].includes(role) ||
        (role === "branch_user" && !["Mansa", "Chinsali"].includes(branch_name))) {
      return reply({ error: "Invalid profile details" }, 400);
    }
    if (userId === authData.user.id && role !== "ceo") return reply({ error: "You cannot remove your own CEO role" }, 400);
    const { error } = await admin.from("profiles").update({ full_name, role, branch_name }).eq("id", userId);
    if (error) return reply({ error: error.message }, 400);
    await writeAdminAudit("CEO_UPDATE_USER", userId, branch_name, { full_name, role, branch_name });
    return reply({ updated: true });
  }

  if (action === "disable" || action === "enable") {
    const userId = String(body.user_id || "");
    if (!userId || userId === authData.user.id) return reply({ error: "Cannot disable or enable this account" }, 400);
    const { error } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: action === "disable" ? "876000h" : "none",
    });
    if (error) return reply({ error: error.message }, 400);
    await writeAdminAudit(action === "disable" ? "CEO_DISABLE_USER" : "CEO_ENABLE_USER", userId, null, { action });
    return reply({ [action === "disable" ? "disabled" : "enabled"]: true });
  }

  return reply({ error: "Unsupported action" }, 400);
});
