/**
 * WebRTC Signaling Event Dispatcher
 * 
 * Routes peer-to-peer connection metadata (SDP offers, answers, ICE candidates)
 * between the screen-sharing host and connected viewers.
 * Adheres to SRP by managing purely signaling message protocol and routing.
 */

const roomManager = require('../rooms/roomManager');
const config = require('../config');
const logger = require('../utils/logger').createChild('SignalingHub');

class SignalingHub {
  /**
   * Binds signaling message and disconnect handlers to an active connection.
   * @param {WsConnection} connection 
   */
  handleConnection(connection) {
    connection.on('message', (rawMessage) => {
      this._routeMessage(connection, rawMessage);
    });

    connection.on('close', () => {
      this._handleDisconnect(connection);
    });
  }

  _routeMessage(connection, rawMessage) {
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch (err) {
      logger.warn(`Invalid JSON payload from ${connection.id}`);
      return;
    }

    const { type, data = {} } = message;

    switch (type) {
      case 'create-room':
        this._onCreateRoom(connection, data);
        break;

      case 'join-room':
        this._onJoinRoom(connection, data);
        break;

      case 'webrtc-offer':
        this._onOffer(connection, data);
        break;

      case 'webrtc-answer':
        this._onAnswer(connection, data);
        break;

      case 'ice-candidate':
        this._onIceCandidate(connection, data);
        break;

      case 'stop-broadcast':
        this._onStopBroadcast(connection);
        break;

      default:
        logger.debug(`Unknown signaling type received: ${type}`);
    }
  }

  _onCreateRoom(connection, { preferredId }) {
    const room = roomManager.createRoom(connection, preferredId);
    connection.send({
      type: 'room-created',
      data: {
        roomId: room.id,
        iceServers: config.webrtc.iceServers
      }
    });
  }

  _onJoinRoom(connection, { roomId }) {
    const result = roomManager.joinRoom(roomId, connection);

    if (!result.success) {
      connection.send({
        type: 'error',
        data: { message: result.error }
      });
      return;
    }

    const { room } = result;

    // Confirm admission to viewer
    connection.send({
      type: 'room-joined',
      data: {
        roomId: room.id,
        viewerId: connection.id,
        iceServers: config.webrtc.iceServers
      }
    });

    // Notify host to initiate WebRTC offer for this viewer
    if (room.hostConnection && room.hostConnection.socket.writable) {
      room.hostConnection.send({
        type: 'viewer-joined',
        data: {
          viewerId: connection.id,
          viewerCount: room.viewerCount
        }
      });
    }
  }

  _onOffer(connection, { targetViewerId, sdp }) {
    const room = roomManager.getRoom(connection.roomId);
    if (!room) return;

    const viewer = room.getViewer(targetViewerId);
    if (viewer && viewer.socket.writable) {
      viewer.send({
        type: 'webrtc-offer',
        data: {
          sdp,
          hostId: connection.id
        }
      });
    }
  }

  _onAnswer(connection, { targetHostId, sdp }) {
    const room = roomManager.getRoom(connection.roomId);
    if (!room || !room.hostConnection) return;

    if (room.hostConnection.id === targetHostId && room.hostConnection.socket.writable) {
      room.hostConnection.send({
        type: 'webrtc-answer',
        data: {
          sdp,
          viewerId: connection.id
        }
      });
    }
  }

  _onIceCandidate(connection, { targetId, candidate }) {
    const room = roomManager.getRoom(connection.roomId);
    if (!room) return;

    // Target could be host or a viewer
    let targetConnection = null;
    if (room.hostConnection && room.hostConnection.id === targetId) {
      targetConnection = room.hostConnection;
    } else {
      targetConnection = room.getViewer(targetId);
    }

    if (targetConnection && targetConnection.socket.writable) {
      targetConnection.send({
        type: 'ice-candidate',
        data: {
          candidate,
          senderId: connection.id
        }
      });
    }
  }

  _onStopBroadcast(connection) {
    const room = roomManager.getRoom(connection.roomId);
    if (!room || room.hostConnection !== connection) return;

    // Notify all viewers that stream ended
    for (const viewer of room.viewers.values()) {
      if (viewer.socket.writable) {
        viewer.send({ type: 'broadcast-ended' });
      }
    }

    roomManager.closeRoom(room.id);
  }

  _handleDisconnect(connection) {
    const { action, room, viewerId } = roomManager.handleDisconnect(connection);

    if (action === 'host_disconnected' && room) {
      for (const viewer of room.viewers.values()) {
        if (viewer.socket.writable) {
          viewer.send({ type: 'broadcast-ended' });
        }
      }
    } else if (action === 'viewer_disconnected' && room && room.hostConnection) {
      if (room.hostConnection.socket.writable) {
        room.hostConnection.send({
          type: 'viewer-left',
          data: {
            viewerId,
            viewerCount: room.viewerCount
          }
        });
      }
    }
  }
}

module.exports = new SignalingHub();
