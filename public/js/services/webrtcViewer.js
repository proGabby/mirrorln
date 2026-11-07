/**
 * WebRTC Viewer Peer Connection Manager
 * 
 * Handles receiving the remote screen-sharing stream.
 * Manages SDP offer acceptance, answer creation, and ICE candidate exchange.
 */

export class WebRtcViewerManager {
  /**
   * @param {Array<RTCIceServer>} iceServers 
   * @param {object} callbacks 
   * @param {Function} callbacks.onRemoteStream (stream: MediaStream) => void
   * @param {Function} callbacks.onIceCandidate (candidate: RTCIceCandidate) => void
   * @param {Function} callbacks.onConnectionStateChange (state: string) => void
   */
  constructor(iceServers = [], callbacks = {}) {
    this.iceServers = iceServers;
    this.callbacks = callbacks;
    this.pc = null;
  }

  setIceServers(iceServers) {
    this.iceServers = iceServers;
  }

  init() {
    if (this.pc) {
      this.close();
    }

    this.pc = new RTCPeerConnection({
      iceServers: this.iceServers
    });

    // Remote media track arrives
    this.pc.ontrack = (event) => {
      if (this.callbacks.onRemoteStream && event.streams && event.streams[0]) {
        this.callbacks.onRemoteStream(event.streams[0]);
      }
    };

    // Local ICE candidate generated
    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.callbacks.onIceCandidate) {
        this.callbacks.onIceCandidate(event.candidate);
      }
    };

    // Connection lifecycle monitoring
    this.pc.onconnectionstatechange = () => {
      if (this.callbacks.onConnectionStateChange) {
        this.callbacks.onConnectionStateChange(this.pc.connectionState);
      }
    };
  }

  /**
   * Processes the SDP offer received from the host and creates an answer.
   * @param {RTCSessionDescriptionInit} sdp 
   * @returns {Promise<RTCSessionDescriptionInit>}
   */
  async handleOffer(sdp) {
    if (!this.pc) {
      this.init();
    }

    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    return this.pc.localDescription;
  }

  /**
   * Adds an ICE candidate received from the host.
   * @param {RTCIceCandidateInit} candidate 
   */
  async handleIceCandidate(candidate) {
    if (this.pc && candidate) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Failed to add remote ICE candidate:', err);
      }
    }
  }

  close() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}

