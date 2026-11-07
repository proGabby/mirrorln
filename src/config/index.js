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
      // High-availability public STUN servers
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      // Open-relay TURN fallback for symmetric NATs and mobile carriers (4G/5G)
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      // Custom TURN server credentials via environment variables (if provided)
      ...(process.env.TURN_URL ? [{
        urls: process.env.TURN_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL
      }] : [])
    ]
  }
};

module.exports = Object.freeze(config);
