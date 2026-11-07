/**
 * Mirrorln — Integration & Unit Test Suite
 * 
 * Verifies core architecture components:
 * 1. RoomManager lifecycle & capacity
 * 2. RFC 6455 FrameParser encoding & decoding
 * 3. SVG QR Code Generator validity
 * 4. Network and Configuration integrity
 */

const assert = require('node:assert');
const roomManager = require('../src/rooms/roomManager');
const { FrameParser, OpCode } = require('../src/websocket/frameParser');
const qrCodeGenerator = require('../src/utils/qrCodeGenerator');
const config = require('../src/config');
const networkUtil = require('../src/utils/network');

async function runTests() {
  console.log('Starting Mirrorln Test Suite...\n');

  // Test 1: Configuration Module
  console.log('Test 1: Configuration Module');
  assert.strictEqual(typeof config.server.port, 'number');
  assert.ok(Array.isArray(config.webrtc.iceServers));
  assert.ok(config.webrtc.iceServers.length > 0);
  console.log('  ✓ Config exports valid port and ICE servers');

  // Test 2: Network Interface Discovery
  console.log('Test 2: Network Interface Discovery');
  const ips = networkUtil.getLocalIpAddresses();
  assert.ok(Array.isArray(ips));
  const urls = networkUtil.getAccessUrls(config.server.port);
  assert.ok(urls.local.includes(`:${config.server.port}`));
  console.log(`  ✓ Detected ${ips.length} local IPv4 interfaces`);

  // Test 3: RFC 6455 WebSocket FrameParser
  console.log('Test 3: RFC 6455 WebSocket FrameParser');
  const sampleText = 'Mirrorln WebRTC Live Stream';
  const encoded = FrameParser.encodeTextFrame(sampleText);
  assert.ok(Buffer.isBuffer(encoded));
  assert.strictEqual(encoded[0], 0x81); // 0x80 (FIN) | 0x01 (TEXT)

  // Test masked client frame decode
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const payloadBuf = Buffer.from('hello', 'utf8');
  const maskedPayload = Buffer.alloc(payloadBuf.length);
  for (let i = 0; i < payloadBuf.length; i++) {
    maskedPayload[i] = payloadBuf[i] ^ mask[i % 4];
  }

  const clientFrame = Buffer.concat([
    Buffer.from([0x81, 0x80 | payloadBuf.length]), // FIN+TEXT, MASKED + length
    mask,
    maskedPayload
  ]);

  const { frames } = FrameParser.decodeFrames(clientFrame);
  assert.strictEqual(frames.length, 1);
  assert.strictEqual(frames[0].opCode, OpCode.TEXT);
  assert.strictEqual(frames[0].payload.toString('utf8'), 'hello');
  console.log('  ✓ FrameParser correctly encodes server frames and decodes masked client frames');

  // Test 4: Zero-Dependency SVG QR Code Generator
  console.log('Test 4: Zero-Dependency SVG QR Code Generator');
  const testUrl = 'https://mirrorln.com/watch/test1234';
  const svg = qrCodeGenerator.generateSvg(testUrl);
  assert.ok(typeof svg === 'string');
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.endsWith('</svg>'));
  assert.ok(svg.includes('viewBox='));
  assert.ok(svg.includes('<rect'));
  console.log('  ✓ SVG QR code successfully generated');

  // Test 5: Room Lifecycle State Manager
  console.log('Test 5: Room Lifecycle State Manager');
  const mockHostConn = {
    id: 'host-socket-1',
    socket: { writable: true }
  };
  const mockViewerConn = {
    id: 'viewer-socket-1',
    socket: { writable: true }
  };

  const room = roomManager.createRoom(mockHostConn, 'testrm');
  assert.strictEqual(room.id, 'testrm');
  assert.strictEqual(roomManager.getRoom('testrm'), room);

  const joinResult = roomManager.joinRoom('testrm', mockViewerConn);
  assert.strictEqual(joinResult.success, true);
  assert.strictEqual(room.viewerCount, 1);

  const disconnectResult = roomManager.handleDisconnect(mockHostConn);
  assert.strictEqual(disconnectResult.action, 'host_disconnected');
  assert.strictEqual(roomManager.getRoom('testrm'), undefined);
  console.log('  ✓ RoomManager handles creation, viewer admission, and host teardown correctly');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY (5/5)\n');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});

