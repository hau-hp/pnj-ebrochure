const { isSupportedPnjUrl, parsePnjProductHtml } = require('../lib/pnj-product');

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
}

module.exports = async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const productUrl = String(req.query?.url || '').trim();
    if (!isSupportedPnjUrl(productUrl)) {
        res.status(400).json({ error: 'Chỉ hỗ trợ link sản phẩm từ pnj.com.vn.' });
        return;
    }

    try {
        const response = await fetch(productUrl, {
            headers: {
                'user-agent': 'Mozilla/5.0 (compatible; PNJ E-Brochure Import/1.0)',
                'accept-language': 'vi-VN,vi;q=0.9,en;q=0.8'
            }
        });

        if (!response.ok) {
            throw new Error(`PNJ trả về mã ${response.status}`);
        }

        const html = await response.text();
        const product = parsePnjProductHtml(html, productUrl);

        if (!product?.product_name) {
            throw new Error('Không đọc được dữ liệu sản phẩm từ trang PNJ.');
        }

        res.status(200).json(product);
    } catch (error) {
        res.status(502).json({
            error: error instanceof Error ? error.message : 'Không thể import sản phẩm từ PNJ.'
        });
    }
};
