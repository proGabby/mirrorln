/**
 * WebSocket Server & HTTP Upgrade Handler
 * 
 * Attaches to standard Node.js HTTP server and upgrades incoming
 * HTTP GET upgrade requests into RFC 6455 compliant WebSocket connections.
 */

const EventEmitter = require('node:events');
const crypto = require('node:crypto');
const WsConnection = require('./wsConnection');
const logger = require('../utils/logger').createChild('WSServer');

const WS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WsServer extends EventEmitter {
  constructor(httpServer) {
    super();
    this.httpServer = httpServer;
    this.connections = new Set();
    this._attachUpgradeListener();
    this._startHeartbeat();
  }

  _attachUpgradeListener() {
    this.httpServer.on('upgrade', (req, socket, head) => {
      // Validate WebSocket handshake requirements
      const upgradeHeader = req.headers['upgrade'];
      const secKey = req.headers['sec-websocket-key'];

      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket' || !secKey) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      // Compute Sec-WebSocket-Accept SHA-1 response hash
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

      // If initial head buffer contains data, restore it
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
    this.heartbeatTimer = setInterval(() => {
      for (const conn of this.connections) {
        if (!conn.isAlive) {
          logger.debug(`Terminating inactive connection ${conn.id}`);
          conn.close(1001, 'Heartbeat Timeout');
          this.connections.delete(conn);
          continue;
        }
        conn.isAlive = false;
        // Client responds with pong to reset isAlive
        if (conn.socket.writable) {
          try {
            conn.socket.write(Buffer.from([0x89, 0x00])); // Ping frame with 0 length
          } catch (e) {
            conn.close();
          }
        }
      }
    }, 30000);
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

