/**
 * Application Configuration Module
 * 
 * Centralizes all environment configuration, networking options,
 * and WebRTC ICE server definitions for the application.
 * Follows the Single Responsibility Principle by serving strictly as the config registry.
 */

const path = require('node:path');

const config = {
  // Server networking settings
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    publicDir: path.resolve(__dirname, '../../public')
  },

  // Room lifecycle & constraints
  room: {
    idLength: 6,
    maxViewersPerRoom: parseInt(process.env.MAX_VIEWERS || '50', 10),
    heartbeatIntervalMs: 30000,
    connectionTimeoutMs: 60000
  },

  // Default ICE server matrix for WebRTC NAT traversal
  webrtc: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  }
};

module.exports = Object.freeze(config);
