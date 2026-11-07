/**
 * Room Domain Entity
 * 
 * Encapsulates the state, participants, and lifecycle of an active screen sharing session.
 * Adheres to SRP by strictly maintaining room membership and metadata.
 */

class Room {
  constructor(id, hostConnection) {
    this.id = id;
    this.hostConnection = hostConnection;
    this.viewers = new Map(); // viewerId -> WsConnection
    this.createdAt = new Date();
    this.isActive = true;
  }

  addViewer(viewerConnection) {
    this.viewers.set(viewerConnection.id, viewerConnection);
  }

  removeViewer(viewerId) {
    return this.viewers.delete(viewerId);
  }

  getViewer(viewerId) {
    return this.viewers.get(viewerId);
  }

  hasViewer(viewerId) {
    return this.viewers.has(viewerId);
  }

  get viewerCount() {
    return this.viewers.size;
  }

  destroy() {
    this.isActive = false;
    this.viewers.clear();
    this.hostConnection = null;
  }
}

module.exports = Room;
