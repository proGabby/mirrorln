/**
 * WebSocket Server & HTTP Upgrade Handler
 * 
 * Supports production-grade 'ws' library (auto-installed on Render/cloud)
 * with graceful fallback to built-in RFC 6455 frame parser.
 */

const EventEmitter = require('node:events');
const crypto = require('node:crypto');
const WsConnection = require('./wsConnection');
const logger = require('../utils/logger').createChild('WSServer');

// Check if production 'ws' package is available
let WsLibServer = null;
try {
  WsLibServer = require('ws').WebSocketServer;
} catch (e) {
  // Use built-in raw TCP parser
}

const WS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// Adapter for 'ws' library connection to match WsConnection interface
class WsLibraryAdapter extends EventEmitter {
  constructor(wsSocket) {
    super();
    this.id = crypto.randomUUID();
    this.ws = wsSocket;
    this.isAlive = true;
    this.roomId = null;
    this.role = null;

    this.ws.on('message', (data) => {
      this.emit('message', data.toString('utf8'));
    });

    this.ws.on('close', () => {
      this.isAlive = false;
      this.emit('close');
    });

    this.ws.on('error', (err) => {
      this.emit('error', err);
    });

    this.ws.on('pong', () => {
      this.isAlive = true;
    });
  }

  send(data) {
    if (this.ws.readyState === 1) { // OPEN
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(payload);
    }
  }

  close(code = 1000, reason = '') {
    if (this.ws.readyState === 1) {
      this.ws.close(code, reason);
    }
  }

  get socket() {
    return { writable: this.ws.readyState === 1 };
  }
}

class WsServer extends EventEmitter {
  constructor(httpServer) {
    super();
    this.httpServer = httpServer;
    this.connections = new Set();

    if (WsLibServer) {
      logger.info('Using high-performance production WebSocket engine (ws)');
      this._initWsLibServer();
    } else {
      logger.info('Using built-in RFC 6455 WebSocket engine');
      this._attachBuiltinUpgradeListener();
    }

    this._startHeartbeat();
  }

  _initWsLibServer() {
    this.wss = new WsLibServer({ noServer: true });

    this.httpServer.on('upgrade', (req, socket, head) => {
      this.wss.handleUpgrade(req, socket, head, (wsSocket) => {
        const connection = new WsLibraryAdapter(wsSocket);
        this.connections.add(connection);

        connection.on('close', () => {
          this.connections.delete(connection);
        });

        this.emit('connection', connection, req);
      });
    });
  }

  _attachBuiltinUpgradeListener() {
    this.httpServer.on('upgrade', (req, socket, head) => {
      const upgradeHeader = req.headers['upgrade'];
      const secKey = req.headers['sec-websocket-key'];

      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket' || !secKey) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      const acceptKey = crypto
        .createHash('sha1')
        .update(secKey + WS_MAGIC_STRING)
        .digest('base64');

      const responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        '\r\n'
      ];

      socket.write(responseHeaders.join('\r\n'));

      if (head && head.length > 0) {
        socket.unshift(head);
      }

      const connection = new WsConnection(socket);
      this.connections.add(connection);

      connection.on('close', () => {
        this.connections.delete(connection);
      });

      this.emit('connection', connection, req);
    });
  }

  _startHeartbeat() {
    // Keepalive ping every 20 seconds to prevent Cloudflare/Render proxy timeouts
    this.heartbeatTimer = setInterval(() => {
      for (const conn of this.connections) {
        if (!conn.isAlive) {
          conn.close(1001, 'Heartbeat Timeout');
          this.connections.delete(conn);
          continue;
        }

        conn.isAlive = false;

        if (conn.ws) {
          // Native ws library ping
          try {
            conn.ws.ping();
          } catch (e) {
            conn.close();
          }
        } else if (conn.socket && conn.socket.writable) {
          // Raw frame ping
          try {
            conn.socket.write(Buffer.from([0x89, 0x00]));
          } catch (e) {
            conn.close();
          }
        }
      }
    }, 20000);
  }

  close() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    for (const conn of this.connections) {
      conn.close(1001, 'Server Shutting Down');
    }
    this.connections.clear();
  }
}

module.exports = WsServer;
