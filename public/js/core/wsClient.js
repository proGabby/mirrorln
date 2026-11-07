/**
 * Client-Side WebSocket Signaling Adapter
 * 
 * Provides an event-driven abstraction over native browser WebSocket.
 * Handles automatic connection initialization and structured message routing.
 */

export class WsClient {
  constructor(endpoint) {
    this.endpoint = endpoint || this._getDefaultWsUrl();
    this.socket = null;
    this.listeners = new Map(); // eventType -> Set<callback>
    this.isConnected = false;
    this.pendingQueue = [];
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
        this.socket = new WebSocket(this.endpoint);

        this.socket.onopen = () => {
          this.isConnected = true;
          this._flushQueue();
          this._emit('open');
          resolve();
        };

        this.socket.onclose = (event) => {
          this.isConnected = false;
          this._emit('close', event);
        };

        this.socket.onerror = (error) => {
          this._emit('error', error);
          reject(error);
        };

        this.socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            const { type, data } = message;
            this._emit(type, data);
          } catch (err) {
            console.warn('Failed to parse WebSocket message:', event.data);
          }
        };
      } catch (err) {
        reject(err);
      }
    });
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
    if (this.isConnected && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    } else {
      this.pendingQueue.push(payload);
    }
  }

  _flushQueue() {
    while (this.pendingQueue.length > 0) {
      const payload = this.pendingQueue.shift();
      this.socket.send(payload);
    }
  }

  close() {
    if (this.socket) {
      this.socket.close();
    }
  }
}

