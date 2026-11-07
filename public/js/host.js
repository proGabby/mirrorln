/**
 * Host UI Orchestration Controller
 * 
 * Coordinates user interface interactions, screen capture,
 * QR code rendering, and WebRTC peer connection pooling.
 */

import { WsClient } from './core/wsClient.js';
import { ScreenCaptureService } from './services/screenCapture.js';
import { WebRtcHostManager } from './services/webrtcHost.js';

class HostController {
  constructor() {
    this.wsClient = new WsClient();
    this.screenCapture = new ScreenCaptureService();
    this.webrtcManager = new WebRtcHostManager([], {
      onIceCandidate: ({ targetId, candidate }) => {
        this.wsClient.send('ice-candidate', { targetId, candidate });
      },
      onOfferReady: ({ targetViewerId, sdp }) => {
        this.wsClient.send('webrtc-offer', { targetViewerId, sdp });
      },
      onViewerDisconnected: () => {
        // Handled via viewer-left event
      }
    });

    this.currentRoomId = null;
    this._bindDomElements();
    this._bindEvents();
  }

  _bindDomElements() {
    this.setupView = document.getElementById('setup-view');
    this.activeView = document.getElementById('active-view');
    this.startBtn = document.getElementById('start-stream-btn');
    this.stopBtn = document.getElementById('stop-stream-btn');
    this.audioToggle = document.getElementById('audio-toggle');
    this.previewVideo = document.getElementById('preview-video');
    this.qrContainer = document.getElementById('qr-container');
    this.shareUrlInput = document.getElementById('share-url-input');
    this.copyBtn = document.getElementById('copy-url-btn');
    this.copyToast = document.getElementById('copy-toast');
    this.statusIndicator = document.getElementById('status-indicator');
    this.statusText = document.getElementById('status-text');
    this.viewerCountBadge = document.getElementById('viewer-count');
  }

  _bindEvents() {
    this.startBtn.addEventListener('click', () => this.startBroadcast());
    this.stopBtn.addEventListener('click', () => this.stopBroadcast());
    this.copyBtn.addEventListener('click', () => this.copyShareUrl());

    this.screenCapture.onStreamEnded(() => {
      this.stopBroadcast();
    });

    // WebSocket Signaling Events
    this.wsClient.on('open', () => {
      this._updateStatus('Ready', 'idle');
    });

    this.wsClient.on('room-created', ({ roomId, iceServers }) => {
      this.currentRoomId = roomId;
      this.webrtcManager.setIceServers(iceServers);
      this._renderSessionDetails(roomId);
    });

    this.wsClient.on('viewer-joined', ({ viewerId, viewerCount }) => {
      this._updateViewerCount(viewerCount);
      this.webrtcManager.createViewerConnection(viewerId);
    });

    this.wsClient.on('webrtc-answer', ({ viewerId, sdp }) => {
      this.webrtcManager.handleAnswer(viewerId, sdp);
    });

    this.wsClient.on('ice-candidate', ({ senderId, candidate }) => {
      this.webrtcManager.handleIceCandidate(senderId, candidate);
    });

    this.wsClient.on('viewer-left', ({ viewerCount }) => {
      this._updateViewerCount(viewerCount);
    });
  }

  async init() {
    try {
      await this.wsClient.connect();
    } catch (err) {
      console.error('Failed to connect to signaling server:', err);
      this._updateStatus('Offline', 'error');
    }
  }

  async startBroadcast() {
    try {
      this.startBtn.disabled = true;
      const stream = await this.screenCapture.startCapture(this.audioToggle.checked);

      this.previewVideo.srcObject = stream;
      this.webrtcManager.setLocalStream(stream);

      // Register room with signaling hub
      this.wsClient.send('create-room', {});

      // Switch view
      this.setupView.classList.add('hidden');
      this.activeView.classList.remove('hidden');
      this._updateStatus('Broadcasting', 'live');
    } catch (err) {
      console.error('Failed to start broadcast:', err);
      alert(`Could not initiate screen share: ${err.message || 'Permission denied'}`);
      this.stopBroadcast();
    } finally {
      this.startBtn.disabled = false;
    }
  }

  stopBroadcast() {
    this.screenCapture.stopCapture();
    this.webrtcManager.closeAll();
    this.wsClient.send('stop-broadcast');

    this.previewVideo.srcObject = null;
    this.currentRoomId = null;

    this.activeView.classList.add('hidden');
    this.setupView.classList.remove('hidden');
    this._updateStatus('Ready', 'idle');
    this._updateViewerCount(0);
  }

  async _renderSessionDetails(roomId) {
    const watchUrl = `${window.location.origin}/watch/${roomId}`;
    this.shareUrlInput.value = watchUrl;

    // Load server-generated clean SVG QR code
    try {
      const response = await fetch(`/api/qr?text=${encodeURIComponent(watchUrl)}`);
      const svgMarkup = await response.text();
      this.qrContainer.innerHTML = svgMarkup;
    } catch (err) {
      console.error('Error fetching QR code SVG:', err);
      this.qrContainer.innerText = 'Scan URL manually';
    }
  }

  async copyShareUrl() {
    if (!this.shareUrlInput.value) return;

    try {
      await navigator.clipboard.writeText(this.shareUrlInput.value);
      this.copyToast.classList.remove('hidden');
      setTimeout(() => {
        this.copyToast.classList.add('hidden');
      }, 2500);
    } catch (err) {
      this.shareUrlInput.select();
      document.execCommand('copy');
    }
  }

  _updateStatus(label, stateClass) {
    this.statusText.innerText = label;
    this.statusIndicator.className = `pulse-dot ${stateClass}`;
  }

  _updateViewerCount(count) {
    this.viewerCountBadge.innerText = `${count} Viewer${count === 1 ? '' : 's'}`;
  }
}

// Bootstrap controller on DOM load
const controller = new HostController();
controller.init();
