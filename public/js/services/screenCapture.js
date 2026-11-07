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
    // 1. Check for Secure Context (W3C requirement for mediaDevices)
    if (window.isSecureContext === false) {
      throw new Error(
        'Insecure context: Screen capture requires HTTPS or localhost. If you are accessing via your network IP (e.g. 192.168.x.x), please open http://localhost:3000 on this computer instead.'
      );
    }

    // 2. Check for mobile browser limitations
    const isMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      if (isMobile) {
        throw new Error(
          'Broadcasting your screen from an iOS browser is restricted by Apple. Please start the broadcast from a Mac or PC desktop browser (your phone can still view the stream!).'
        );
      }
      throw new Error(
        'Screen capture is not supported in this browser. Please open in Google Chrome, Brave, Edge, Safari, or Firefox on desktop.'
      );
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

