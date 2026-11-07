# Concurrency & Interview Verification Guide

This guide details how Mirrorln operates concurrently alongside third-party video conferencing and online interview suites, and provides verification test procedures.

---

## 1. Operating System Display Compositor Architecture

### Why Screen Capture is Non-Exclusive
In modern operating systems (macOS WindowServer / Quartz, Windows Desktop Window Manager / DWM, Linux Wayland / PipeWire):
- **Display Framebuffers are Shared Memory:** The operating system renders the composite desktop or window surfaces into graphics memory.
- **Multiple Consumers Can Read Concurrently:** Unlike physical hardware camera lenses (which can only feed one capture driver exclusively), the desktop compositor permits multiple processes or browser tabs to invoke `getDisplayMedia()` concurrently.

```
       [ macOS Quartz / Windows DWM Compositor ]
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
  [ Google Meet ]      [ Zoom ]       [ Mirrorln ]
 (Active Meeting)   (Recording)     (P2P Stream via QR)
```

---

## 2. Multi-Tasking Scenarios

### Scenario A: Full Desktop Mirroring
- **Interview Tool:** Share your full screen in Zoom / Google Meet.
- **Mirrorln:** Broadcast full screen to secondary device via QR code.
- **Result:** Both viewers see identical frames in real time with hardware-accelerated video encoding.

### Scenario B: Split Scope Mirroring (Recommended for Confidentiality)
- **Interview Tool:** Select only **Application Window** (e.g. VS Code, Chrome, or CoderPad).
- **Mirrorln:** Select **Entire Screen** (capturing terminal, background references, notes).
- **Result:** The interviewers see only the assigned code editor window, while your secondary screen or phone sees the broader workspace.

---

## 3. End-to-End Verification Checklist

### Local Wi-Fi Verification
1. Launch Mirrorln:
   ```bash
   npm start
   ```
2. Open `http://localhost:3000` in your computer's browser.
3. Click **Select Screen & Broadcast**.
4. With your phone connected to the same Wi-Fi, open the camera app and scan the on-screen QR code.
5. Confirm that your phone opens `http://<LAN_IP>:3000/watch/<room>` and starts streaming with sub-second latency.

### Simultaneous Meeting Verification
1. Start a Google Meet (`meet.new`) or Zoom test call.
2. Share your screen in the meeting.
3. Keep the meeting active, return to Mirrorln (`http://localhost:3000`), and click **Select Screen & Broadcast**.
4. Confirm both streams transmit smoothly without dropped frames or permission warnings.

