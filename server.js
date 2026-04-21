const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const apiPnjProduct = require('./api/pnj-product');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const MAX_PORT_RETRIES = 10;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.otf': 'font/otf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
}

function serveStatic(req, res, pathname) {
    const normalizedPath = pathname === '/' ? '/index.html' : pathname;
    const absolutePath = path.join(ROOT_DIR, path.normalize(normalizedPath));

    if (!absolutePath.startsWith(ROOT_DIR)) {
        sendJson(res, 403, { error: 'Forbidden' });
        return;
    }

    fs.stat(absolutePath, (statError, stats) => {
        if (statError || !stats.isFile()) {
            sendJson(res, 404, { error: 'Not found' });
            return;
        }

        const ext = path.extname(absolutePath).toLowerCase();
        res.statusCode = 200;
        res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
        fs.createReadStream(absolutePath).pipe(res);
    });
}

let activePort = PORT;

function handleRequest(req, res) {
    const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${activePort}`}`);

    if (requestUrl.pathname === '/api/pnj-product') {
        req.query = Object.fromEntries(requestUrl.searchParams.entries());
        apiPnjProduct(req, res);
        return;
    }

    serveStatic(req, res, requestUrl.pathname);
}

function startServer(port, retriesLeft = MAX_PORT_RETRIES) {
    activePort = port;
    const server = http.createServer(handleRequest);

    server.once('error', (error) => {
        const canRetry = error?.code === 'EADDRINUSE' && retriesLeft > 0 && !process.env.PORT;
        if (canRetry) {
            const nextPort = port + 1;
            console.warn(`Port ${port} is busy, retrying on ${nextPort}...`);
            setTimeout(() => startServer(nextPort, retriesLeft - 1), 60);
            return;
        }

        console.error(error);
        process.exit(1);
    });

    server.listen(port, HOST, () => {
        console.log(`PNJ e-brochure dev server running at http://${HOST}:${port}`);
    });
}

startServer(PORT);
