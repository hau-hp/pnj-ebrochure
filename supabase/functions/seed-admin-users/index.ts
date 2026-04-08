import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-seed-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

type SeedUser = {
  username: string;
  password: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const expectedSeedKey = Deno.env.get("ADMIN_SEED_KEY");
  if (expectedSeedKey && req.headers.get("x-seed-key") !== expectedSeedKey) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase env configuration." }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const body: { users?: SeedUser[] } = await req.json().catch(() => ({}));
  const users = Array.isArray(body.users) ? body.users : [];
  if (!users.length) {
    return jsonResponse({ error: "Missing users payload." }, 400);
  }

  const results = [];

  for (const user of users) {
    const username = String(user.username || "").trim().toLowerCase();
    const password = String(user.password || "");
    if (!username || !password) {
      results.push({ username, status: "skipped", reason: "missing username or password" });
      continue;
    }

    const email = `${username}+pnjcreative@example.com`;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        role: "admin",
      },
      app_metadata: {
        role: "admin",
      },
    });

    if (error) {
      const duplicate = /already been registered|already exists/i.test(error.message || "");
      results.push({
        username,
        email,
        status: duplicate ? "exists" : "error",
        reason: error.message,
      });
      continue;
    }

    results.push({
      username,
      email,
      status: "created",
      user_id: data.user?.id || null,
    });
  }

  return jsonResponse({ results }, 200);
});
