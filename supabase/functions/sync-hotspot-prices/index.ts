const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const NEXT_DATA_RE = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i;
const JSON_LD_PRODUCT_RE = /<script type="application\/ld\+json">\s*({[\s\S]*?"@type":"Product"[\s\S]*?})\s*<\/script>/i;
const DEFAULT_SYNC_LIMIT = 200;
const DEFAULT_CONCURRENCY = 4;

type HotspotRow = {
  id: string;
  product_url: string | null;
  product_name: string | null;
  price: string | null;
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

function stripHtmlTags(value: string) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function formatPriceVnd(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
}

function toFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const digitsOnly = value.replace(/\D/g, "");
    if (!digitsOnly) return null;
    const parsed = Number(digitsOnly);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickNumber(sources: Record<string, unknown>[], keys: string[]) {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of keys) {
      const raw = source[key];
      const parsed = toFiniteNumber(raw);
      if (parsed && parsed > 0) return parsed;
    }
  }
  return null;
}

function buildPricingPayload(sources: Record<string, unknown>[]) {
  const saleKeys = [
    "net_price", "netPrice",
    "sale_price", "special_price", "final_price", "selling_price",
    "salePrice", "specialPrice", "finalPrice", "sellingPrice", "price",
  ];
  const originalKeys = [
    "original_price", "old_price", "list_price", "regular_price", "compare_at_price", "market_price",
    "originalPrice", "oldPrice", "listPrice", "regularPrice", "compareAtPrice", "marketPrice",
  ];
  const percentKeys = [
    "discount_percent", "discountPercent", "sale_off_percent", "percent_discount", "saleOffPercent",
  ];

  let saleValue = pickNumber(sources, saleKeys);
  let originalValue = pickNumber(sources, originalKeys);
  let discountPercent = pickNumber(sources, percentKeys);

  if (originalValue && saleValue && originalValue < saleValue) {
    const temp = originalValue;
    originalValue = saleValue;
    saleValue = temp;
  }

  if (originalValue && saleValue && originalValue > saleValue) {
    const computedPercent = Number((((originalValue - saleValue) / originalValue) * 100).toFixed(2));
    if (!discountPercent || discountPercent <= 0 || discountPercent > 99) {
      discountPercent = computedPercent;
    }
  } else {
    discountPercent = null;
  }

  const effectiveValue = saleValue || originalValue || null;
  const roundedDiscount = discountPercent ? Math.round(discountPercent) : null;

  return {
    price: formatPriceVnd(effectiveValue),
    price_sale: formatPriceVnd(saleValue || effectiveValue),
    price_original: formatPriceVnd(originalValue),
    discount_percent: discountPercent,
    discount_label: roundedDiscount ? `Giảm ${roundedDiscount}%` : "",
  };
}

function normalizeImages(images: unknown[]) {
  return [...new Set(
    (images || [])
      .map((image) => String(image || "").trim())
      .filter(Boolean),
  )];
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parsePnjProductHtml(html: string, productUrl: string) {
  const nextDataMatch = html.match(NEXT_DATA_RE);
  const nextData = nextDataMatch ? parseJson<Record<string, unknown>>(nextDataMatch[1]) : null;
  const pageProps = (nextData?.props as Record<string, unknown> | undefined)?.pageProps as Record<string, unknown> | undefined;
  const serverSide = pageProps?.dataServerSide as Record<string, unknown> | undefined;

  if (pageProps || serverSide) {
    const images = normalizeImages([
      ...((serverSide?.images as unknown[]) || []),
      serverSide?.main_image_link,
      pageProps?.image,
    ]);

    const pricing = buildPricingPayload([
      {
        salePrice: pageProps?.netPrice || serverSide?.net_price,
        originalPrice: pageProps?.originalPrice || serverSide?.price,
      },
      serverSide || {},
      pageProps || {},
    ]);
    const product = {
      product_name: String(serverSide?.product || pageProps?.productName || "").trim(),
      ...pricing,
      image_url: images.join(","),
      image_count: images.length,
      description: stripHtmlTags(
        decodeHtmlEntities(String(serverSide?.full_description || pageProps?.description || "")),
      ),
      product_url: String(pageProps?.productURL || productUrl),
    };

    if (product.product_name) return product;
  }

  const jsonLdMatch = html.match(JSON_LD_PRODUCT_RE);
  const jsonLd = jsonLdMatch ? parseJson<Record<string, unknown>>(jsonLdMatch[1]) : null;
  if (jsonLd) {
    const offers = jsonLd.offers as Record<string, unknown> | undefined;
    const images = normalizeImages(Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image]);
    const pricing = buildPricingPayload([
      offers || {},
      (offers?.priceSpecification as Record<string, unknown> | undefined) || {},
      {
        originalPrice: (offers?.priceSpecification as Record<string, unknown> | undefined)?.price || offers?.highPrice,
        price: offers?.price,
      },
    ]);
    const product = {
      product_name: String(jsonLd.name || "").trim(),
      ...pricing,
      image_url: images.join(","),
      image_count: images.length,
      description: stripHtmlTags(String(jsonLd.description || "")),
      product_url: String(offers?.url || productUrl),
    };

    if (product.product_name) return product;
  }

  return null;
}

function isSupportedPnjUrl(input: string) {
  try {
    const url = new URL(String(input || "").trim());
    return /^([a-z0-9-]+\.)*pnj\.com\.vn$/i.test(url.hostname) && /\/site\/san-pham\/.+/i.test(url.pathname);
  } catch {
    return false;
  }
}

function sanitizeLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(500, Math.max(1, Math.floor(parsed)));
}

function isMissingPricingColumnErrorText(raw: string) {
  const text = String(raw || "").toLowerCase();
  if (!text.includes("pgrst204") && !text.includes("could not find")) return false;
  return (
    text.includes("price_sale") ||
    text.includes("price_original") ||
    text.includes("discount_percent") ||
    text.includes("discount_label") ||
    text.includes("price_synced_at")
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const syncKey = Deno.env.get("PRICE_SYNC_KEY") || "";
  if (syncKey) {
    const incomingKey = String(req.headers.get("x-sync-key") || "").trim();
    if (!incomingKey || incomingKey !== syncKey) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  const url = new URL(req.url);
  const syncLimit = sanitizeLimit(
    url.searchParams.get("limit") || Deno.env.get("PRICE_SYNC_LIMIT") || null,
    DEFAULT_SYNC_LIMIT,
  );
  const concurrency = sanitizeLimit(
    url.searchParams.get("concurrency") || Deno.env.get("PRICE_SYNC_CONCURRENCY") || null,
    DEFAULT_CONCURRENCY,
  );

  const restHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  const fetchHotspotsRes = await fetch(
    `${supabaseUrl}/rest/v1/hotspots?select=id,product_url,product_name,price&order=created_at.desc&limit=${syncLimit}`,
    { headers: restHeaders },
  );
  if (!fetchHotspotsRes.ok) {
    const details = await fetchHotspotsRes.text();
    return jsonResponse({ error: "Failed to load hotspots", details }, 502);
  }

  const allHotspots = (await fetchHotspotsRes.json()) as HotspotRow[];
  const candidates = allHotspots.filter((spot) => isSupportedPnjUrl(String(spot.product_url || "")));
  const startedAt = Date.now();

  const syncResults = await mapWithConcurrency(candidates, async (spot) => {
    const productUrl = String(spot.product_url || "").trim();
    try {
      const response = await fetch(productUrl, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; PNJ E-Brochure Price Sync/1.0)",
          "accept-language": "vi-VN,vi;q=0.9,en;q=0.8",
        },
      });
      if (!response.ok) {
        throw new Error(`PNJ trả về mã ${response.status}`);
      }

      const html = await response.text();
      const product = parsePnjProductHtml(html, productUrl);
      if (!product?.product_name) {
        throw new Error("Không đọc được dữ liệu sản phẩm.");
      }

      const payload = {
        product_name: product.product_name || spot.product_name || "",
        price: product.price_sale || product.price || spot.price || "",
        price_sale: product.price_sale || product.price || "",
        price_original: product.price_original || "",
        discount_percent: product.discount_percent ?? null,
        discount_label: product.discount_label || "",
        price_synced_at: new Date().toISOString(),
      };

      const updateRes = await fetch(
        `${supabaseUrl}/rest/v1/hotspots?id=eq.${encodeURIComponent(spot.id)}`,
        {
          method: "PATCH",
          headers: {
            ...restHeaders,
            Prefer: "return=minimal",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!updateRes.ok) {
        const errorText = await updateRes.text();
        if (isMissingPricingColumnErrorText(errorText)) {
          const fallbackPayload = {
            product_name: payload.product_name,
            price: payload.price,
          };
          const fallbackRes = await fetch(
            `${supabaseUrl}/rest/v1/hotspots?id=eq.${encodeURIComponent(spot.id)}`,
            {
              method: "PATCH",
              headers: {
                ...restHeaders,
                Prefer: "return=minimal",
              },
              body: JSON.stringify(fallbackPayload),
            },
          );
          if (!fallbackRes.ok) {
            const fallbackErrorText = await fallbackRes.text();
            throw new Error(`Update fallback thất bại: ${fallbackErrorText}`);
          }

          return {
            hotspot_id: spot.id,
            status: "updated_basic",
            product_name: payload.product_name,
            price: payload.price,
            discount_percent: null,
          };
        }
        throw new Error(`Update thất bại: ${errorText}`);
      }

      return {
        hotspot_id: spot.id,
        status: "updated",
        product_name: payload.product_name,
        price: payload.price,
        discount_percent: payload.discount_percent,
      };
    } catch (error) {
      return {
        hotspot_id: spot.id,
        status: "failed",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }, concurrency);

  const updated = syncResults.filter((item) => item.status === "updated" || item.status === "updated_basic");
  const updatedFull = syncResults.filter((item) => item.status === "updated");
  const updatedBasic = syncResults.filter((item) => item.status === "updated_basic");
  const failed = syncResults.filter((item) => item.status === "failed");
  const durationMs = Date.now() - startedAt;

  return jsonResponse({
    ok: true,
    scanned: allHotspots.length,
    candidates: candidates.length,
    updated: updated.length,
    updated_full: updatedFull.length,
    updated_basic: updatedBasic.length,
    failed: failed.length,
    duration_ms: durationMs,
    failures: failed.slice(0, 15),
  });
});
