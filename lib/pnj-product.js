const NEXT_DATA_RE = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i;
const JSON_LD_PRODUCT_RE = /<script type="application\/ld\+json">\s*({[\s\S]*?"@type":"Product"[\s\S]*?})\s*<\/script>/i;

function stripHtmlTags(value) {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function decodeHtmlEntities(value) {
    return String(value || '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function formatPriceVnd(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return '';
    return `${new Intl.NumberFormat('vi-VN').format(amount)}đ`;
}

function normalizeImages(images) {
    return [...new Set(
        (images || [])
            .map((image) => String(image || '').trim())
            .filter(Boolean)
    )];
}

function parseNextData(html) {
    const match = html.match(NEXT_DATA_RE);
    if (!match) return null;

    try {
        return JSON.parse(match[1]);
    } catch {
        return null;
    }
}

function parseJsonLdProduct(html) {
    const match = html.match(JSON_LD_PRODUCT_RE);
    if (!match) return null;

    try {
        return JSON.parse(match[1]);
    } catch {
        return null;
    }
}

function extractFromNextData(nextData, productUrl) {
    const pageProps = nextData?.props?.pageProps;
    const serverSide = pageProps?.dataServerSide;
    if (!serverSide && !pageProps) return null;

    const images = normalizeImages([
        ...(serverSide?.images || []),
        serverSide?.main_image_link,
        pageProps?.image
    ]);

    const description = stripHtmlTags(decodeHtmlEntities(serverSide?.full_description || pageProps?.description || ''));
    const rawPrice = serverSide?.price || pageProps?.originalPrice || 0;

    return {
        product_name: serverSide?.product || pageProps?.productName || '',
        price: formatPriceVnd(rawPrice),
        price_value: Number(rawPrice) || null,
        image_url: images.join(','),
        image_count: images.length,
        images,
        description,
        product_url: pageProps?.productURL || productUrl,
        product_code: serverSide?.product_code || pageProps?.productCode || '',
        note: serverSide?.note || serverSide?.product_note || '',
        availability: serverSide?.availability || pageProps?.availability || ''
    };
}

function extractFromJsonLd(jsonLd, productUrl) {
    if (!jsonLd) return null;

    const images = normalizeImages(Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image]);
    const rawPrice = jsonLd?.offers?.price || 0;

    return {
        product_name: jsonLd.name || '',
        price: formatPriceVnd(rawPrice),
        price_value: Number(rawPrice) || null,
        image_url: images.join(','),
        image_count: images.length,
        images,
        description: stripHtmlTags(jsonLd.description || ''),
        product_url: jsonLd?.offers?.url || productUrl,
        product_code: jsonLd.sku || '',
        note: '',
        availability: jsonLd?.offers?.availability || ''
    };
}

function parsePnjProductHtml(html, productUrl) {
    const nextData = parseNextData(html);
    const fromNextData = extractFromNextData(nextData, productUrl);
    if (fromNextData?.product_name && fromNextData?.image_count) {
        return fromNextData;
    }

    const jsonLd = parseJsonLdProduct(html);
    const fromJsonLd = extractFromJsonLd(jsonLd, productUrl);
    if (fromJsonLd?.product_name) {
        return fromJsonLd;
    }

    return null;
}

function isSupportedPnjUrl(input) {
    try {
        const url = new URL(String(input || '').trim());
        return /^([a-z0-9-]+\.)*pnj\.com\.vn$/i.test(url.hostname) && /\/site\/san-pham\/.+/i.test(url.pathname);
    } catch {
        return false;
    }
}

module.exports = {
    formatPriceVnd,
    isSupportedPnjUrl,
    parsePnjProductHtml
};
