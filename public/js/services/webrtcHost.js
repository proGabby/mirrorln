/**
 * WebRTC Host Peer Connection Pool Manager
 * 
 * Manages individual RTCPeerConnection instances for multiple concurrent viewers.
 * Coordinates SDP offer generation, track distribution, and ICE candidate exchange.
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
   * @param {string} viewerId 
   * @param {RTCSessionDescriptionInit} sdp 
   */
  async handleAnswer(viewerId, sdp) {
    const pc = this.connections.get(viewerId);
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (err) {
      console.error(`Error setting remote answer for viewer ${viewerId}:`, err);
    }
  }

  /**
   * Applies ICE candidate received from a viewer.
   * @param {string} viewerId 
   * @param {RTCIceCandidateInit} candidate 
   */
  async handleIceCandidate(viewerId, candidate) {
    const pc = this.connections.get(viewerId);
    if (!pc || !candidate) return;

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error(`Error adding ICE candidate for viewer ${viewerId}:`, err);
    }
  }

  closeViewerConnection(viewerId) {
    const pc = this.connections.get(viewerId);
    if (pc) {
      pc.close();
      this.connections.delete(viewerId);
    }
  }

  closeAll() {
    for (const [viewerId, pc] of this.connections.entries()) {
      pc.close();
    }
    this.connections.clear();
  }
}

