/**
 * RFC 6455 WebSocket Frame Parser & Serializer
 * 
 * Provides pure binary encoding and decoding for WebSocket data framing.
 * Compliant with standard OpCodes:
 *  0x1: Text Frame
 *  0x2: Binary Frame
 *  0x8: Connection Close
 *  0x9: Ping
 *  0xA: Pong
 */

const OpCode = {
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xA
};

class FrameParser {
  /**
   * Encodes a UTF-8 text message into an unmasked RFC 6455 server-to-client frame.
   * @param {string} text 
   * @returns {Buffer}
   */
  static encodeTextFrame(text) {
    const payload = Buffer.from(text, 'utf8');
    const length = payload.length;

    let header;
    if (length <= 125) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | OpCode.TEXT; // FIN + OpCode
      header[1] = length;            // Unmasked (mask bit = 0)
    } else if (length <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | OpCode.TEXT;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | OpCode.TEXT;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    return Buffer.concat([header, payload]);
  }

  /**
   * Encodes a Close frame.
   * @param {number} code 
   * @param {string} reason 
   * @returns {Buffer}
   */
  static encodeCloseFrame(code = 1000, reason = '') {
    const reasonBuffer = Buffer.from(reason, 'utf8');
    const payload = Buffer.alloc(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);

    const header = Buffer.alloc(2);
    header[0] = 0x80 | OpCode.CLOSE;
    header[1] = payload.length;

    return Buffer.concat([header, payload]);
  }

  /**
   * Encodes a Pong response frame.
   * @param {Buffer} payload 
   * @returns {Buffer}
   */
  static encodePongFrame(payload = Buffer.alloc(0)) {
    const header = Buffer.alloc(2);
    header[0] = 0x80 | OpCode.PONG;
    header[1] = payload.length;
    return Buffer.concat([header, payload]);
  }

  /**
   * Decodes buffered data received from a client socket.
   * Client-to-server frames are ALWAYS masked (RFC 6455 Section 5.1).
   * @param {Buffer} buffer 
   * @returns {{ frames: Array<{ opCode: number, payload: Buffer }>, remaining: Buffer }}
   */
  static decodeFrames(buffer) {
    const frames = [];
    let offset = 0;

    while (buffer.length - offset >= 2) {
      const firstByte = buffer[offset];
      const secondByte = buffer[offset + 1];

      const opCode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) === 0x80;
      let payloadLength = secondByte & 0x7f;
      let headerLength = 2;

      if (payloadLength === 126) {
        if (buffer.length - offset < 4) break;
        payloadLength = buffer.readUInt16BE(offset + 2);
        headerLength = 4;
      } else if (payloadLength === 127) {
        if (buffer.length - offset < 10) break;
        payloadLength = Number(buffer.readBigUInt64BE(offset + 2));
        headerLength = 10;
      }

      const maskLength = isMasked ? 4 : 0;
      const totalFrameSize = headerLength + maskLength + payloadLength;

      if (buffer.length - offset < totalFrameSize) {
        // Need more data from socket
        break;
      }

      let payload = Buffer.alloc(payloadLength);
      if (isMasked) {
        const mask = buffer.slice(offset + headerLength, offset + headerLength + 4);
        const rawPayload = buffer.slice(offset + headerLength + 4, offset + totalFrameSize);

        for (let i = 0; i < payloadLength; i++) {
          payload[i] = rawPayload[i] ^ mask[i % 4];
        }
      } else {
        payload = buffer.slice(offset + headerLength, offset + totalFrameSize);
      }

      frames.push({ opCode, payload });
      offset += totalFrameSize;
    }

    return {
      frames,
      remaining: buffer.slice(offset)
    };
  }
}

module.exports = {
  OpCode,
  FrameParser
};
