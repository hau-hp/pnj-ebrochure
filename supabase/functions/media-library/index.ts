import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ADMIN_EMAILS = new Set([
  "hau.hp+pnjcreative@example.com",
  "anh.hk+pnjcreative@example.com",
  "chau.hg+pnjcreative@example.com",
  "hau.nt+pnjcreative@example.com",
  "yen.dnh+pnjcreative@example.com",
]);

const defaultCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  action?: "delete";
  media_id?: string;
  public_id?: string;
  resource_type?: "image" | "video" | "raw";
};

function normalizeOrigins(value: string | undefined) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCorsHeaders(origin: string | null, allowedOrigins: string[]) {
  if (!origin || !allowedOrigins.length) {
    return {
      ...defaultCorsHeaders,
      "Access-Control-Allow-Origin": "*",
    };
  }

  if (allowedOrigins.includes(origin)) {
    return {
      ...defaultCorsHeaders,
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
    };
  }

  return {
    ...defaultCorsHeaders,
    "Access-Control-Allow-Origin": "null",
  };
}

function jsonResponse(
  body: unknown,
  status = 200,
  origin: string | null = null,
  allowedOrigins: string[] = [],
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(origin, allowedOrigins),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function sha1Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getUserEmailFromToken(token: string, supabaseUrl: string, apikey: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return "";
  const payload = await response.json().catch(() => ({}));
  return String(payload?.email || "").toLowerCase();
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const allowedOrigins = normalizeOrigins(Deno.env.get("ADMIN_ALLOWED_ORIGINS"));
  const corsHeaders = buildCorsHeaders(origin, allowedOrigins);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin, allowedOrigins);
  }

  if (allowedOrigins.length && origin && !allowedOrigins.includes(origin)) {
    return jsonResponse({ error: "Origin is not allowed." }, 403, origin, allowedOrigins);
  }

  const token = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return jsonResponse({ error: "Missing bearer token." }, 401, origin, allowedOrigins);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceRoleKey;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ error: "Missing Supabase env configuration." }, 500, origin, allowedOrigins);
  }

  const requesterEmail = await getUserEmailFromToken(token, supabaseUrl, anonKey);
  if (!ALLOWED_ADMIN_EMAILS.has(requesterEmail)) {
    return jsonResponse({ error: "Unauthorized admin account." }, 403, origin, allowedOrigins);
  }

  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "";
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY") || "";
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET") || "";
  if (!cloudName || !apiKey || !apiSecret) {
    return jsonResponse({ error: "Missing Cloudinary env configuration." }, 500, origin, allowedOrigins);
  }

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  if (body.action !== "delete") {
    return jsonResponse({ error: "Unsupported action." }, 400, origin, allowedOrigins);
  }

  const mediaId = String(body.media_id || "").trim();
  const publicId = String(body.public_id || "").trim();
  const resourceType = (String(body.resource_type || "image").trim().toLowerCase() as "image" | "video" | "raw");
  if (!mediaId || !publicId || !["image", "video", "raw"].includes(resourceType)) {
    return jsonResponse({ error: "Missing media_id/public_id/resource_type." }, 400, origin, allowedOrigins);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha1Hex(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`);

  const destroyResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      public_id: publicId,
      api_key: apiKey,
      timestamp: String(timestamp),
      signature,
      invalidate: "true",
    }),
  });

  const destroyPayload = await destroyResponse.json().catch(() => ({}));
  const result = String(destroyPayload?.result || "");
  if (!destroyResponse.ok || (result !== "ok" && result !== "not found")) {
    return jsonResponse(
      { error: destroyPayload?.error?.message || "Cloudinary delete failed.", details: destroyPayload },
      502,
      origin,
      allowedOrigins,
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: deleteError } = await adminClient.from("media_assets").delete().eq("id", mediaId);
  if (deleteError) {
    return jsonResponse({ error: deleteError.message }, 500, origin, allowedOrigins);
  }

  return jsonResponse({ ok: true, result }, 200, origin, allowedOrigins);
});
