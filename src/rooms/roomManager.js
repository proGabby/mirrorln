/**
 * Room State Manager
 * 
 * Provides thread-safe, in-memory lifecycle registry for all active broadcast rooms.
 * Generates unique short room identifiers and enforces room integrity.
 */

const crypto = require('node:crypto');
const Room = require('./room');
const config = require('../config');
const logger = require('../utils/logger').createChild('RoomManager');

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> Room
    this.connectionToRoomMap = new Map(); // connectionId -> roomId
  }

  /**
   * Generates a collision-free URL-safe room identifier.
   * @param {number} length 
   * @returns {string}
   */
  generateRoomId(length = config.room.idLength) {
    const charset = 'abcdefghjkmnpqrstuvwxyz23456789';
    let id;
    do {
      id = '';
      const bytes = crypto.randomBytes(length);
      for (let i = 0; i < length; i++) {
        id += charset[bytes[i] % charset.length];
      }
    } while (this.rooms.has(id));
    return id;
  }

  /**
   * Registers a new broadcast session with the host connection.
   * @param {WsConnection} hostConnection 
   * @param {string} [preferredId] 
   * @returns {Room}
   */
  createRoom(hostConnection, preferredId) {
    const roomId = preferredId || this.generateRoomId();
    const room = new Room(roomId, hostConnection);

    this.rooms.set(roomId, room);
    this.connectionToRoomMap.set(hostConnection.id, roomId);
    hostConnection.roomId = roomId;
    hostConnection.role = 'host';

    logger.info(`Broadcast room created: ${roomId} (Host: ${hostConnection.id})`);
    return room;
  }

  /**
   * Fetches an active room by its identifier.
   * @param {string} roomId 
   * @returns {Room|undefined}
   */
  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  /**
   * Adds a viewer connection to an existing room.
   * @param {string} roomId 
   * @param {WsConnection} viewerConnection 
   * @returns {{ room: Room, success: boolean, error?: string }}
   */
  joinRoom(roomId, viewerConnection) {
    const room = this.rooms.get(roomId);
    if (!room || !room.isActive) {
      return { success: false, error: 'Broadcast session not found or has ended.' };
    }

    if (room.viewerCount >= config.room.maxViewersPerRoom) {
      return { success: false, error: 'Room capacity reached.' };
    }

    room.addViewer(viewerConnection);
    this.connectionToRoomMap.set(viewerConnection.id, roomId);
    viewerConnection.roomId = roomId;
    viewerConnection.role = 'viewer';

    logger.info(`Viewer ${viewerConnection.id} joined room: ${roomId} (Total: ${room.viewerCount})`);
    return { success: true, room };
  }

  /**
   * Cleans up room resources and mappings when a connection disconnects.
   * @param {WsConnection} connection 
   * @returns {{ action: 'host_disconnected'|'viewer_disconnected'|'none', room?: Room, viewerId?: string }}
   */
  handleDisconnect(connection) {
    const roomId = connection.roomId || this.connectionToRoomMap.get(connection.id);
    if (!roomId) return { action: 'none' };

    const room = this.rooms.get(roomId);
    this.connectionToRoomMap.delete(connection.id);

    if (!room) return { action: 'none' };

    if (connection.role === 'host') {
      logger.info(`Host disconnected. Purging room ${roomId}`);
      this.rooms.delete(roomId);
      room.destroy();
      return { action: 'host_disconnected', room };
    } else {
      room.removeViewer(connection.id);
      logger.info(`Viewer ${connection.id} disconnected from room ${roomId} (Remaining: ${room.viewerCount})`);
      return { action: 'viewer_disconnected', room, viewerId: connection.id };
    }
  }

  /**
   * Explicitly closes and deletes a room.
   * @param {string} roomId 
   */
  closeRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.hostConnection) {
      this.connectionToRoomMap.delete(room.hostConnection.id);
    }
    for (const viewerId of room.viewers.keys()) {
      this.connectionToRoomMap.delete(viewerId);
    }

    this.rooms.delete(roomId);
    room.destroy();
    logger.info(`Room ${roomId} manually closed by host.`);
  }
}

module.exports = new RoomManager();

