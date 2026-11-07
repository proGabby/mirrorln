/**
 * Mirrorln — Application Bootstrap & Composition Root
 * 
 * Initializes the HTTP server, WebSocket signaling subsystem,
 * and static file handling.
 */

const http = require('node:http');
const config = require('./config');
const logger = require('./utils/logger').createChild('Bootstrap');
const networkUtil = require('./utils/network');
const apiRouter = require('./http/apiRouter');
const staticServer = require('./http/staticServer');
const WsServer = require('./websocket/wsServer');
const signalingHub = require('./signaling/signalingHub');

// 1. Create native HTTP server
const httpServer = http.createServer((req, res) => {
  // Delegate to API router first
  if (apiRouter.handle(req, res)) {
    return;
  }

  // Fallback to static asset server
  if (staticServer.serve(req, res)) {
    return;
  }

  // Final 404 handler
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

// 2. Initialize RFC 6455 WebSocket Server attached to HTTP server
const wsServer = new WsServer(httpServer);

// 3. Connect incoming WebSocket clients to WebRTC signaling hub
wsServer.on('connection', (connection) => {
  signalingHub.handleConnection(connection);
});

// 4. Start HTTP listening
httpServer.listen(config.server.port, config.server.host, () => {
  const urls = networkUtil.getAccessUrls(config.server.port);

  console.log(`\n======================================================`);
  console.log(`  📡 Mirrorln WebRTC Screen Mirroring Platform`);
  console.log(`------------------------------------------------------`);
  console.log(`  Local URL:        ${urls.local}`);
  urls.network.forEach((url) => {
    console.log(`  Network URL:      ${url}`);
  });
  console.log(`======================================================\n`);

  logger.info(`Server initialized successfully on port ${config.server.port}`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

function shutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  wsServer.close();
  httpServer.close(() => {
    logger.info('HTTP server closed. Exiting process.');
    process.exit(0);
  });
}
