/**
 * Screen Capture Service
 * 
 * Interacts with browser navigator.mediaDevices.getDisplayMedia API.
 * Encapsulates track extraction, audio capture options, and lifecycle events.
 */

export class ScreenCaptureService {
  constructor() {
    this.stream = null;
    this.onStreamEndedCallbacks = new Set();
  }

  /**
   * Prompts OS dialog to select screen, window, or tab.
   * @param {boolean} includeAudio 
   * @returns {Promise<MediaStream>}
   */
  async startCapture(includeAudio = true) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('Screen capture is not supported in this browser.');
    }

    const constraints = {
      video: {
        cursor: 'always',
        frameRate: { ideal: 30, max: 60 }
      },
      audio: includeAudio ? { echoCancellation: true, noiseSuppression: true } : false
    };

    this.stream = await navigator.mediaDevices.getDisplayMedia(constraints);

    // Watch for native OS / browser "Stop sharing" bar interaction
    const videoTrack = this.stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.addEventListener('ended', () => {
        this._notifyEnded();
      });
    }

    return this.stream;
  }

  /**
   * Registers a listener triggered when the user stops sharing via native browser controls.
   * @param {Function} callback 
   */
  onStreamEnded(callback) {
    this.onStreamEndedCallbacks.add(callback);
  }

  _notifyEnded() {
    for (const callback of this.onStreamEndedCallbacks) {
      try {
        callback();
      } catch (err) {
        console.error('Error in onStreamEnded callback:', err);
      }
    }
  }

  /**
   * Explicitly terminates all media tracks.
   */
  stopCapture() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  getTracks() {
    return this.stream ? this.stream.getTracks() : [];
  }
}
