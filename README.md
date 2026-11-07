# Mirrorln 📡

> Instant, zero-install WebRTC screen sharing using QR codes across the global internet.

## Overview

Mirrorln enables any computer or laptop to broadcast its entire screen, an application window (such as VS Code, Figma, terminal, etc.), or a specific browser tab to any smartphone, tablet, or secondary computer in the world with sub-second latency. No native apps, plugins, or account registrations are required.

## Key Features

- **Zero Install:** Runs 100% inside standard modern web browsers.
- **Universal Capture:** Share full monitors or individual third-party apps outside the browser.
- **Instant Pairing:** Viewers scan a single dynamic QR code to immediately connect.
- **Sub-Second Latency:** Ultra-low latency via native WebRTC peer-to-peer data transport.
- **End-to-End Encrypted:** Media frames are protected via DTLS-SRTP.
- **Concurrent Streaming:** Can stream simultaneously while active in Zoom, Google Meet, or online interview suites.

## Architecture & Principles

Mirrorln is designed following **Clean Architecture** and the **Single Responsibility Principle (SRP)**:
- Modular, decoupled server components with zero external dependencies.
- Independent RFC 6455 WebSocket engine for real-time signaling.
- Isolated in-memory room management and lifecycle coordination.
- Discrete client services for screen capture, WebRTC peer connection pooling, and UI controls.

## Getting Started

### Prerequisites
- Node.js >= 18.0.0

### Running the Application
```bash
# Start the production server
npm start

# Or run in development watch mode
npm run dev
```

Visit `http://localhost:3000` in your browser.

