/**
 * WebRTC Host Peer Connection Pool Manager
 * 
 * Manages individual RTCPeerConnection instances for multiple concurrent viewers.
 * Implements per-viewer ICE candidate queuing to prevent early candidate drops.
 */

export class WebRtcHostManager {
  /**
   * @param {Array<RTCIceServer>} iceServers 
   * @param {object} callbacks 
   * @param {Function} callbacks.onIceCandidate ({ targetId, candidate }) => void
   * @param {Function} callbacks.onOfferReady ({ targetViewerId, sdp }) => void
   * @param {Function} callbacks.onViewerDisconnected (viewerId) => void
   */
  constructor(iceServers = [], callbacks = {}) {
    this.iceServers = iceServers;
    this.callbacks = callbacks;
    this.connections = new Map(); // viewerId -> RTCPeerConnection
    this.candidateQueues = new Map(); // viewerId -> Array<candidate>
    this.remoteDescSet = new Map(); // viewerId -> boolean
    this.localStream = null;
  }

  setLocalStream(stream) {
    this.localStream = stream;
  }

  setIceServers(iceServers) {
    this.iceServers = iceServers;
  }

  /**
   * Initializes a new peer connection for a newly joined viewer.
   * @param {string} viewerId 
   */
  async createViewerConnection(viewerId) {
    if (this.connections.has(viewerId)) {
      this.closeViewerConnection(viewerId);
    }

    this.candidateQueues.set(viewerId, []);
    this.remoteDescSet.set(viewerId, false);

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers
    });

    this.connections.set(viewerId, pc);

    // Attach screen & audio tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    // Prioritize H.264 video codec for iOS Safari and mobile compatibility
    try {
      const transceivers = pc.getTransceivers();
      for (const t of transceivers) {
        if (t.sender && t.sender.track && t.sender.track.kind === 'video') {
          if (typeof RTCRtpSender.getCapabilities === 'function') {
            const capabilities = RTCRtpSender.getCapabilities('video');
            if (capabilities && capabilities.codecs) {
              const h264Codecs = capabilities.codecs.filter(
                (c) => c.mimeType.toLowerCase() === 'video/h264'
              );
              const otherCodecs = capabilities.codecs.filter(
                (c) => c.mimeType.toLowerCase() !== 'video/h264'
              );
              if (h264Codecs.length > 0 && typeof t.setCodecPreferences === 'function') {
                t.setCodecPreferences([...h264Codecs, ...otherCodecs]);
              }
            }
          }
        }
      }
    } catch (codecErr) {
      console.warn('Could not enforce H.264 codec preference:', codecErr);
    }

    // ICE candidate gathering
    pc.onicecandidate = (event) => {
      if (event.candidate && this.callbacks.onIceCandidate) {
        this.callbacks.onIceCandidate({
          targetId: viewerId,
          candidate: event.candidate
        });
      }
    };

    // Connection lifecycle monitoring
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.closeViewerConnection(viewerId);
        if (this.callbacks.onViewerDisconnected) {
          this.callbacks.onViewerDisconnected(viewerId);
        }
      }
    };

    // Create and dispatch SDP offer
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (this.callbacks.onOfferReady) {
        this.callbacks.onOfferReady({
          targetViewerId: viewerId,
          sdp: pc.localDescription
        });
      }
    } catch (err) {
      console.error(`Failed to create offer for viewer ${viewerId}:`, err);
    }
  }

  /**
   * Applies SDP answer received from a viewer.
   * Flushes queued ICE candidates for this viewer.
   * @param {string} viewerId 
   * @param {RTCSessionDescriptionInit} sdp 
   */
  async handleAnswer(viewerId, sdp) {
    const pc = this.connections.get(viewerId);
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      this.remoteDescSet.set(viewerId, true);

      // Flush queued ICE candidates
      const queue = this.candidateQueues.get(viewerId) || [];
      while (queue.length > 0) {
        const candidate = queue.shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn(`Failed adding queued ICE candidate for viewer ${viewerId}:`, e);
        }
      }
    } catch (err) {
      console.error(`Error setting remote answer for viewer ${viewerId}:`, err);
    }
  }

  /**
   * Applies or queues ICE candidate received from a viewer.
   * @param {string} viewerId 
   * @param {RTCIceCandidateInit} candidate 
   */
  async handleIceCandidate(viewerId, candidate) {
    const pc = this.connections.get(viewerId);
    if (!pc || !candidate) return;

    if (!this.remoteDescSet.get(viewerId)) {
      const queue = this.candidateQueues.get(viewerId) || [];
      queue.push(candidate);
      this.candidateQueues.set(viewerId, queue);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn(`Error adding ICE candidate for viewer ${viewerId}:`, err);
    }
  }

  closeViewerConnection(viewerId) {
    const pc = this.connections.get(viewerId);
    if (pc) {
      pc.close();
      this.connections.delete(viewerId);
    }
    this.candidateQueues.delete(viewerId);
    this.remoteDescSet.delete(viewerId);
  }

  closeAll() {
    for (const [viewerId, pc] of this.connections.entries()) {
      pc.close();
    }
    this.connections.clear();
    this.candidateQueues.clear();
    this.remoteDescSet.clear();
  }
}
