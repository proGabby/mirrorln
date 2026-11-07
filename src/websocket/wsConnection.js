/**
 * WebSocket Connection Wrapper
 * 
 * Manages an individual client WebSocket connection over a raw TCP stream.
 * Emits high-level events: 'message', 'close', 'ping', 'pong', 'error'.
 */

const EventEmitter = require('node:events');
const crypto = require('node:crypto');
const { OpCode, FrameParser } = require('./frameParser');
const logger = require('../utils/logger').createChild('WSConnection');

class WsConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.id = crypto.randomUUID();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.isAlive = true;
    this.roomId = null;
    this.role = null; // 'host' | 'viewer'

    this._bindSocketEvents();
  }

  _bindSocketEvents() {
    this.socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this._processBuffer();
    });

    this.socket.on('close', () => {
      this.isAlive = false;
      this.emit('close');
    });

    this.socket.on('error', (err) => {
      logger.error(`Socket error on connection ${this.id}:`, err);
      this.emit('error', err);
    });
  }

  _processBuffer() {
    try {
      const { frames, remaining } = FrameParser.decodeFrames(this.buffer);
      this.buffer = remaining;

      for (const frame of frames) {
        switch (frame.opCode) {
          case OpCode.TEXT:
            this.emit('message', frame.payload.toString('utf8'));
            break;

          case OpCode.PING:
            this.isAlive = true;
            this.socket.write(FrameParser.encodePongFrame(frame.payload));
            this.emit('ping');
            break;

          case OpCode.PONG:
            this.isAlive = true;
            this.emit('pong');
            break;

          case OpCode.CLOSE:
            this.close();
            break;

          default:
            logger.debug(`Unhandled OpCode: ${frame.opCode}`);
        }
      }
    } catch (err) {
      logger.error('Failed to parse incoming WebSocket frame:', err);
      this.close(1002, 'Protocol Error');
    }
  }

  /**
   * Transmits a JSON payload or text string to the client.
   * @param {string|object} data 
   */
  send(data) {
    if (!this.socket.writable) return;
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const frame = FrameParser.encodeTextFrame(text);
    this.socket.write(frame);
  }

  /**
   * Gracefully terminates the WebSocket session.
   * @param {number} code 
   * @param {string} reason 
   */
  close(code = 1000, reason = 'Normal Closure') {
    if (!this.socket.writable) return;
    try {
      this.socket.write(FrameParser.encodeCloseFrame(code, reason));
    } catch (e) {
      // Ignore write errors during teardown
    } finally {
      this.socket.end();
    }
  }
}

module.exports = WsConnection;
