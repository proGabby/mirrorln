/**
 * WebRTC Viewer Peer Connection Manager
 * 
 * Handles receiving the remote screen-sharing stream.
 * Implements ICE candidate queuing to avoid race conditions before
 * remote description resolution.
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
    this.isRemoteDescriptionSet = false;
    this.candidateQueue = [];
  }

  setIceServers(iceServers) {
    this.iceServers = iceServers;
  }

  init() {
    if (this.pc) {
      this.close();
    }

    this.isRemoteDescriptionSet = false;
    this.candidateQueue = [];

    this.pc = new RTCPeerConnection({
      iceServers: this.iceServers
    });

    // Explicitly declare receive-only transceivers for WebKit / Safari
    try {
      this.pc.addTransceiver('video', { direction: 'recvonly' });
      this.pc.addTransceiver('audio', { direction: 'recvonly' });
    } catch (e) {
      console.warn('Could not declare recvonly transceivers:', e);
    }

    // Remote media track arrives
    this.pc.ontrack = (event) => {
      if (this.callbacks.onRemoteStream) {
        if (event.streams && event.streams[0]) {
          this.callbacks.onRemoteStream(event.streams[0]);
        } else if (event.track) {
          // Fallback if streams array is empty in certain mobile WebKit engines
          const fallbackStream = new MediaStream([event.track]);
          this.callbacks.onRemoteStream(fallbackStream);
        }
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
      if (this.callbacks.onConnectionStateChange && this.pc) {
        this.callbacks.onConnectionStateChange(this.pc.connectionState);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return;
      const iceState = this.pc.iceConnectionState;
      if (iceState === 'connected' || iceState === 'completed') {
        if (this.callbacks.onConnectionStateChange) {
          this.callbacks.onConnectionStateChange('connected');
        }
      } else if (iceState === 'failed') {
        if (this.callbacks.onConnectionStateChange) {
          this.callbacks.onConnectionStateChange('failed');
        }
      } else if (iceState === 'checking') {
        if (this.callbacks.onConnectionStateChange) {
          this.callbacks.onConnectionStateChange('connecting');
        }
      }
    };
  }

  /**
   * Processes the SDP offer received from the host and creates an answer.
   * Flushes queued ICE candidates immediately after remote description is applied.
   * @param {RTCSessionDescriptionInit} sdp 
   * @returns {Promise<RTCSessionDescriptionInit>}
   */
  async handleOffer(sdp) {
    if (!this.pc) {
      this.init();
    }

    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.isRemoteDescriptionSet = true;

    // Flush any ICE candidates that arrived early
    while (this.candidateQueue.length > 0) {
      const candidate = this.candidateQueue.shift();
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Failed to add queued ICE candidate on viewer:', err);
      }
    }

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    return this.pc.localDescription;
  }

  /**
   * Adds an ICE candidate or queues it if remote description is still pending.
   * @param {RTCIceCandidateInit} candidate 
   */
  async handleIceCandidate(candidate) {
    if (!candidate) return;

    if (!this.pc || !this.isRemoteDescriptionSet) {
      this.candidateQueue.push(candidate);
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('Failed to add remote ICE candidate on viewer:', err);
    }
  }

  close() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.isRemoteDescriptionSet = false;
    this.candidateQueue = [];
  }
}
