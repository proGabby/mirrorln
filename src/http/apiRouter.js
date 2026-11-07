/**
 * HTTP REST API & Route Dispatcher
 * 
 * Handles specialized application endpoints (/api/info, /api/qr, /watch/:roomId).
 * Integrates CORS and JSON response formatting.
 */

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const networkUtil = require('../utils/network');
const qrCodeGenerator = require('../utils/qrCodeGenerator');

class ApiRouter {
  /**
   * Routes incoming HTTP requests.
   * @param {import('node:http').IncomingMessage} req 
   * @param {import('node:http').ServerResponse} res 
   * @returns {boolean} True if route was handled, false if fallback to static.
   */
  handle(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // CORS headers for API calls
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }

    // 1. Diagnostics endpoint
    if (pathname === '/api/info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'online',
        port: config.server.port,
        urls: networkUtil.getAccessUrls(config.server.port)
      }));
      return true;
    }

    // 2. SVG QR Code generation endpoint
    if (pathname === '/api/qr') {
      const text = parsedUrl.searchParams.get('text');
      if (!text) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing text parameter' }));
        return true;
      }

      const svg = qrCodeGenerator.generateSvg(text);
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600'
      });
      res.end(svg);
      return true;
    }

    // 3. Dynamic viewer route: /watch/:roomId
    if (pathname.startsWith('/watch/')) {
      const watchHtmlPath = path.join(config.server.publicDir, 'watch.html');
      if (fs.existsSync(watchHtmlPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(watchHtmlPath).pipe(res);
        return true;
      }
    }

    return false;
  }
}

module.exports = new ApiRouter();
