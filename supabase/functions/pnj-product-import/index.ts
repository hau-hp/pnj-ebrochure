const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

const NEXT_DATA_RE = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i;
const JSON_LD_PRODUCT_RE = /<script type="application\/ld\+json">\s*({[\s\S]*?"@type":"Product"[\s\S]*?})\s*<\/script>/i;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function isSupportedPnjUrl(input: string) {
  try {
    const url = new URL(String(input || "").trim());
    return /^([a-z0-9-]+\.)*pnj\.com\.vn$/i.test(url.hostname) && /\/site\/san-pham\/.+/i.test(url.pathname);
  } catch {
    return false;
  }
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

    const rawPrice = serverSide?.price || pageProps?.originalPrice || 0;
    const product = {
      product_name: String(serverSide?.product || pageProps?.productName || "").trim(),
      price: formatPriceVnd(rawPrice),
      price_value: Number(rawPrice) || null,
      image_url: images.join(","),
      image_count: images.length,
      images,
      description: stripHtmlTags(
        decodeHtmlEntities(String(serverSide?.full_description || pageProps?.description || "")),
      ),
      product_url: String(pageProps?.productURL || productUrl),
      product_code: String(serverSide?.product_code || pageProps?.productCode || "").trim(),
      note: String(serverSide?.note || serverSide?.product_note || "").trim(),
      availability: String(serverSide?.availability || pageProps?.availability || "").trim(),
    };

    if (product.product_name) return product;
  }

  const jsonLdMatch = html.match(JSON_LD_PRODUCT_RE);
  const jsonLd = jsonLdMatch ? parseJson<Record<string, unknown>>(jsonLdMatch[1]) : null;
  if (jsonLd) {
    const offers = jsonLd.offers as Record<string, unknown> | undefined;
    const images = normalizeImages(Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image]);
    const rawPrice = offers?.price || 0;
    const product = {
      product_name: String(jsonLd.name || "").trim(),
      price: formatPriceVnd(rawPrice),
      price_value: Number(rawPrice) || null,
      image_url: images.join(","),
      image_count: images.length,
      images,
      description: stripHtmlTags(String(jsonLd.description || "")),
      product_url: String(offers?.url || productUrl),
      product_code: String(jsonLd.sku || "").trim(),
      note: "",
      availability: String(offers?.availability || "").trim(),
    };

    if (product.product_name) return product;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const productUrl = String(url.searchParams.get("url") || "").trim();

  if (!isSupportedPnjUrl(productUrl)) {
    return jsonResponse({ error: "Chỉ hỗ trợ link sản phẩm từ pnj.com.vn." }, 400);
  }

  try {
    const response = await fetch(productUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; PNJ E-Brochure Import/1.0)",
        "accept-language": "vi-VN,vi;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`PNJ trả về mã ${response.status}`);
    }

    const html = await response.text();
    const product = parsePnjProductHtml(html, productUrl);

    if (!product?.product_name) {
      throw new Error("Không đọc được dữ liệu sản phẩm từ trang PNJ.");
    }

    return jsonResponse(product, 200);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Không thể import sản phẩm từ PNJ.",
      },
      502,
    );
  }
});
