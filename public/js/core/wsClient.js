/**
 * Client-Side WebSocket Signaling Adapter
 * 
 * Provides an event-driven abstraction over native browser WebSocket.
 * Features automatic reconnection, proxy keepalive heartbeats,
 * and reliable message queuing.
 */

export class WsClient {
  constructor(endpoint) {
    this.endpoint = endpoint || this._getDefaultWsUrl();
    this.socket = null;
    this.listeners = new Map(); // eventType -> Set<callback>
    this.isConnected = false;
    this.pendingQueue = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 30;
    this.reconnectTimer = null;
    this.pingTimer = null;
  }

  _getDefaultWsUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  /**
   * Establishes WebSocket connection.
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        if (this.socket) {
          try { this.socket.close(); } catch (e) {}
        }

        this.socket = new WebSocket(this.endpoint);

        this.socket.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this._startKeepAlive();
          this._flushQueue();
          this._emit('open');
          resolve();
        };

        this.socket.onclose = (event) => {
          this.isConnected = false;
          this._stopKeepAlive();
          this._emit('close', event);
          this._scheduleReconnect();
        };

        this.socket.onerror = (error) => {
          this._emit('error', error);
          // onclose will fire after onerror and trigger reconnect
        };

        this.socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            const { type, data } = message;
            if (type === 'pong') return; // Heartbeat response
            this._emit(type, data);
          } catch (err) {
            console.warn('Failed to parse WebSocket message:', event.data);
          }
        };
      } catch (err) {
        this._scheduleReconnect();
        reject(err);
      }
    });
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 8000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
        this._emit('reconnected');
      } catch (e) {
        // Next onclose will schedule again
      }
    }, delay);
  }

  _startKeepAlive() {
    this._stopKeepAlive();
    // Send lightweight heartbeat every 15s to keep Render/Cloudflare proxy tunnels active
    this.pingTimer = setInterval(() => {
      if (this.isConnected && this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);
  }

  _stopKeepAlive() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Registers an event listener for a message type.
   * @param {string} type 
   * @param {Function} callback 
   */
  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
  }

  /**
   * Removes an event listener.
   * @param {string} type 
   * @param {Function} callback 
   */
  off(type, callback) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).delete(callback);
    }
  }

  _emit(type, data) {
    if (this.listeners.has(type)) {
      for (const callback of this.listeners.get(type)) {
        try {
          callback(data);
        } catch (err) {
          console.error(`Error in listener for ${type}:`, err);
        }
      }
    }
  }

  /**
   * Sends a structured message to the server.
   * @param {string} type 
   * @param {object} [data] 
   */
  send(type, data = {}) {
    const payload = JSON.stringify({ type, data });
    if (this.isConnected && this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    } else {
      this.pendingQueue.push(payload);
    }
  }

  _flushQueue() {
    while (this.pendingQueue.length > 0) {
      const payload = this.pendingQueue.shift();
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(payload);
      }
    }
  }

  close() {
    this._stopKeepAlive();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
    }
  }
}
