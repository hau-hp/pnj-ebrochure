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

function toFiniteNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const digitsOnly = value.replace(/\D/g, '');
        if (!digitsOnly) return null;
        const parsed = Number(digitsOnly);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function pickNumber(sources, keys) {
    for (const source of sources) {
        if (!source || typeof source !== 'object') continue;
        for (const key of keys) {
            const raw = source[key];
            const parsed = toFiniteNumber(raw);
            if (parsed && parsed > 0) return parsed;
        }
    }
    return null;
}

function buildPricingPayload(sources) {
    const saleKeys = [
        'sale_price', 'special_price', 'final_price', 'selling_price',
        'salePrice', 'specialPrice', 'finalPrice', 'sellingPrice', 'price'
    ];
    const originalKeys = [
        'original_price', 'old_price', 'list_price', 'regular_price', 'compare_at_price', 'market_price',
        'originalPrice', 'oldPrice', 'listPrice', 'regularPrice', 'compareAtPrice', 'marketPrice'
    ];
    const percentKeys = [
        'discount_percent', 'discountPercent', 'sale_off_percent', 'percent_discount', 'saleOffPercent'
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
        price_value: effectiveValue,
        price_sale: formatPriceVnd(saleValue || effectiveValue),
        price_sale_value: saleValue || effectiveValue,
        price_original: formatPriceVnd(originalValue),
        price_original_value: originalValue,
        discount_percent: discountPercent,
        discount_label: roundedDiscount ? `Giảm ${roundedDiscount}%` : ''
    };
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
    const pricing = buildPricingPayload([serverSide, pageProps]);

    return {
        product_name: serverSide?.product || pageProps?.productName || '',
        ...pricing,
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
    const offers = jsonLd?.offers || {};
    const pricing = buildPricingPayload([
        offers,
        offers?.priceSpecification || {},
        {
            originalPrice: offers?.highPrice,
            price: offers?.price
        }
    ]);

    return {
        product_name: jsonLd.name || '',
        ...pricing,
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
