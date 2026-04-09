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
  action?: "delete" | "sync";
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

function toBase64(value: string) {
  return btoa(value);
}

type CloudinaryResource = {
  secure_url?: string;
  public_id?: string;
  resource_type?: string;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  filename?: string;
  created_at?: string;
};

async function fetchCloudinaryResources(
  cloudName: string,
  apiKey: string,
  apiSecret: string,
  resourceType: "image" | "video" | "raw",
  prefix = "",
  maxPages = 10,
) {
  const authHeader = `Basic ${toBase64(`${apiKey}:${apiSecret}`)}`;
  const items: CloudinaryResource[] = [];
  let nextCursor = "";
  let pages = 0;

  while (pages < maxPages) {
    pages += 1;
    const query = new URLSearchParams({
      type: "upload",
      max_results: "500",
    });
    if (prefix) query.set("prefix", prefix);
    if (nextCursor) query.set("next_cursor", nextCursor);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}?${query.toString()}`,
      { headers: { Authorization: authHeader } },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Cloudinary resources API failed for ${resourceType}.`);
    }

    const resources = Array.isArray(payload?.resources) ? payload.resources : [];
    resources.forEach((resource: CloudinaryResource) => items.push(resource));
    nextCursor = String(payload?.next_cursor || "");
    if (!nextCursor) break;
  }

  return items;
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
  if (!body.action) {
    return jsonResponse({ error: "Unsupported action." }, 400, origin, allowedOrigins);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (body.action === "sync") {
    try {
      const prefix = String(Deno.env.get("CLOUDINARY_SYNC_PREFIX") || "").trim();
      const [images, videos] = await Promise.all([
        fetchCloudinaryResources(cloudName, apiKey, apiSecret, "image", prefix),
        fetchCloudinaryResources(cloudName, apiKey, apiSecret, "video", prefix),
      ]);

      const items = [...images, ...videos]
        .map((resource) => ({
          secure_url: String(resource?.secure_url || "").trim(),
          public_id: String(resource?.public_id || "").trim(),
          resource_type: (String(resource?.resource_type || "").trim().toLowerCase() || "image"),
          format: String(resource?.format || "").trim() || null,
          width: Number(resource?.width) || null,
          height: Number(resource?.height) || null,
          bytes: Number(resource?.bytes) || null,
          original_filename: String(resource?.filename || "").trim() || null,
          uploaded_by: requesterEmail.split("+pnjcreative@")[0] || null,
          created_at: String(resource?.created_at || "").trim() || new Date().toISOString(),
        }))
        .filter((item) => item.secure_url && item.public_id && ["image", "video", "raw"].includes(item.resource_type));

      if (!items.length) {
        return jsonResponse({ ok: true, synced: 0, totalFetched: 0 }, 200, origin, allowedOrigins);
      }

      const { error: upsertError } = await adminClient
        .from("media_assets")
        .upsert(items, { onConflict: "secure_url" });
      if (upsertError) {
        return jsonResponse({ error: upsertError.message }, 500, origin, allowedOrigins);
      }

      return jsonResponse(
        { ok: true, synced: items.length, totalFetched: images.length + videos.length },
        200,
        origin,
        allowedOrigins,
      );
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : "Cloudinary sync failed." },
        502,
        origin,
        allowedOrigins,
      );
    }
  }

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
  // Cloudinary signature must include all signed params (invalidate, public_id, timestamp)
  // sorted alphabetically before appending api secret.
  const signature = await sha1Hex(`invalidate=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`);

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

  const { error: deleteError } = await adminClient.from("media_assets").delete().eq("id", mediaId);
  if (deleteError) {
    return jsonResponse({ error: deleteError.message }, 500, origin, allowedOrigins);
  }

  return jsonResponse({ ok: true, result }, 200, origin, allowedOrigins);
});
