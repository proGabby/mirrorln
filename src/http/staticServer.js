/**
 * Static Asset Delivery Server
 * 
 * Safely resolves and streams static files from public directory.
 * Prevents directory traversal attacks and applies strict MIME mappings.
 */

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

class StaticServer {
  constructor(baseDir = config.server.publicDir) {
    this.baseDir = path.resolve(baseDir);
  }

  /**
   * Attempts to serve a static file for an incoming HTTP request.
   * @param {import('node:http').IncomingMessage} req 
   * @param {import('node:http').ServerResponse} res 
   * @returns {boolean} True if file was handled/found, false otherwise.
   */
  serve(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // Map root to index.html
    if (pathname === '/' || pathname === '') {
      pathname = '/index.html';
    }

    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    const absolutePath = path.resolve(this.baseDir, `.${safePath}`);

    // Security: Block directory traversal outside baseDir
    if (!absolutePath.startsWith(this.baseDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return true;
    }

    if (!fs.existsSync(absolutePath)) {
      return false; // Handled by next router
    }

    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      const indexPath = path.join(absolutePath, 'index.html');
      if (fs.existsSync(indexPath)) {
        return this._sendFile(indexPath, res);
      }
      return false;
    }

    return this._sendFile(absolutePath, res);
  }

  _sendFile(filePath, res) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    return true;
  }
}

module.exports = new StaticServer();

