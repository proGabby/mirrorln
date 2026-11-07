/**
 * Viewer UI Orchestration Controller
 * 
 * Manages viewer connection lifecycle, WebRTC media reception,
 * video playback autoplay policies, and fullscreen toggles.
 */

import { WsClient } from './core/wsClient.js';
import { WebRtcViewerManager } from './services/webrtcViewer.js';

class ViewerController {
  constructor() {
    this.roomId = this._extractRoomId();
    this.hostId = null;

    this.wsClient = new WsClient();
    this.webrtcManager = new WebRtcViewerManager([], {
      onRemoteStream: (stream) => this._onRemoteStreamReceived(stream),
      onIceCandidate: (candidate) => {
        if (this.hostId) {
          this.wsClient.send('ice-candidate', {
            targetId: this.hostId,
            candidate
          });
        }
      },
      onConnectionStateChange: (state) => this._onConnectionStateChange(state)
    });

    this._bindDomElements();
    this._bindEvents();
  }

  _extractRoomId() {
    const parts = window.location.pathname.split('/');
    return parts[parts.length - 1] || null;
  }

  _bindDomElements() {
    this.container = document.getElementById('viewer-container');
    this.video = document.getElementById('remote-video');
    this.overlay = document.getElementById('viewer-overlay');
    this.overlaySpinner = document.getElementById('overlay-spinner');
    this.overlayHeading = document.getElementById('overlay-heading');
    this.overlaySubtext = document.getElementById('overlay-subtext');
    this.retryBtn = document.getElementById('retry-btn');
    this.streamIndicator = document.getElementById('stream-indicator');
    this.streamStatusText = document.getElementById('stream-status-text');
    this.unmuteBtn = document.getElementById('unmute-btn');
    this.fullscreenBtn = document.getElementById('fullscreen-btn');
  }

  _bindEvents() {
    this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    this.unmuteBtn.addEventListener('click', () => this.unmuteAudio());
    this.retryBtn.addEventListener('click', () => window.location.reload());

    // Signaling events
    this.wsClient.on('open', () => {
      this.streamStatusText.innerText = 'Joining room...';
      this.wsClient.send('join-room', { roomId: this.roomId });
    });

    this.wsClient.on('room-joined', ({ iceServers }) => {
      this.webrtcManager.setIceServers(iceServers);
      this.webrtcManager.init();
      this.overlayHeading.innerText = 'Connected to Room';
      this.overlaySubtext.innerText = 'Waiting for host to transmit screen stream...';
      this.streamStatusText.innerText = 'Waiting for Host';
    });

    this.wsClient.on('webrtc-offer', async ({ sdp, hostId }) => {
      this.hostId = hostId;
      try {
        const answer = await this.webrtcManager.handleOffer(sdp);
        this.wsClient.send('webrtc-answer', {
          targetHostId: hostId,
          sdp: answer
        });
      } catch (err) {
        console.error('Failed to answer WebRTC offer:', err);
        this._showError('Connection Error', 'Could not establish media session with host.');
      }
    });

    this.wsClient.on('ice-candidate', ({ candidate }) => {
      this.webrtcManager.handleIceCandidate(candidate);
    });

    this.wsClient.on('broadcast-ended', () => {
      this._showError('Broadcast Ended', 'The host has stopped sharing their screen.');
      if (this.video.srcObject) {
        this.video.srcObject.getTracks().forEach((track) => track.stop());
        this.video.srcObject = null;
      }
    });

    this.wsClient.on('error', ({ message }) => {
      this._showError('Stream Unavailable', message || 'Could not join broadcast session.');
    });
  }

  async init() {
    if (!this.roomId) {
      this._showError('Invalid Link', 'No broadcast room ID was found in this URL.');
      return;
    }

    try {
      await this.wsClient.connect();
    } catch (err) {
      console.error('Failed to connect to signaling server:', err);
      this._showError('Network Error', 'Could not establish connection to signaling hub.');
    }
  }

  async _onRemoteStreamReceived(stream) {
    this.video.srcObject = stream;

    try {
      // Attempt unmuted autoplay
      await this.video.play();
      this._setLiveState();
    } catch (err) {
      console.warn('Autoplay with unmuted audio prevented by browser policy:', err);
      // Fallback: Mute and play, then present Unmute button
      this.video.muted = true;
      await this.video.play();
      this._setLiveState();
      this.unmuteBtn.classList.remove('hidden');
    }
  }

  _setLiveState() {
    this.overlay.classList.add('hidden');
    this.streamIndicator.className = 'pulse-dot live';
    this.streamStatusText.innerText = 'Live';
  }

  _onConnectionStateChange(state) {
    if (state === 'connected') {
      this._setLiveState();
    } else if (state === 'disconnected' || state === 'failed') {
      this.streamIndicator.className = 'pulse-dot idle';
      this.streamStatusText.innerText = 'Reconnecting...';
    }
  }

  unmuteAudio() {
    this.video.muted = false;
    this.unmuteBtn.classList.add('hidden');
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (this.container.requestFullscreen) {
        this.container.requestFullscreen();
      } else if (this.video.webkitEnterFullscreen) {
        // Native iOS Safari fullscreen support
        this.video.webkitEnterFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  _showError(title, subtext) {
    this.overlaySpinner.classList.add('hidden');
    this.overlayHeading.innerText = title;
    this.overlaySubtext.innerText = subtext;
    this.retryBtn.classList.remove('hidden');
    this.overlay.classList.remove('hidden');
    this.streamIndicator.className = 'pulse-dot error';
    this.streamStatusText.innerText = 'Offline';
  }
}

// Bootstrap viewer on DOM load
const viewer = new ViewerController();
viewer.init();

