/**
 * Zero-Dependency SVG QR Code Generator
 * 
 * Implements ISO/IEC 18004 standard QR Code generation algorithm in pure JavaScript.
 * Generates lightweight, crisp vector SVG output without third-party dependencies.
 */

class QrCodeGenerator {
  /**
   * Generates an SVG string representation of a QR code for a given text.
   * @param {string} text 
   * @param {object} options 
   * @returns {string} SVG markup
   */
  generateSvg(text, options = {}) {
    const margin = options.margin !== undefined ? options.margin : 2;
    const color = options.color || '#0f172a';
    const background = options.background || '#ffffff';
    const size = options.size || 256;

    const matrix = this._createMatrix(text);
    const moduleCount = matrix.length;
    const viewSize = moduleCount + margin * 2;

    let rects = [];
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (matrix[r][c]) {
          rects.push(`<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="${color}" />`);
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" width="${size}" height="${size}" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="${background}" />
  ${rects.join('\n  ')}
</svg>`;
  }

  // --- Internal QR Matrix Construction ---

  _createMatrix(text) {
    // Select version based on input byte length
    const bytes = Buffer.from(text, 'utf8');
    const version = this._determineVersion(bytes.length);
    const size = version * 4 + 17;

    const matrix = Array.from({ length: size }, () => Array(size).fill(null));

    // 1. Finder patterns (Top-Left, Top-Right, Bottom-Left)
    this._addFinderPattern(matrix, 0, 0);
    this._addFinderPattern(matrix, size - 7, 0);
    this._addFinderPattern(matrix, 0, size - 7);

    // 2. Alignment pattern for Version >= 2
    if (version >= 2) {
      const alignPos = size - 7;
      this._addAlignmentPattern(matrix, alignPos, alignPos);
    }

    // 3. Timing patterns
    for (let i = 8; i < size - 8; i++) {
      const val = i % 2 === 0;
      if (matrix[6][i] === null) matrix[6][i] = val;
      if (matrix[i][6] === null) matrix[i][6] = val;
    }

    // 4. Dark module
    matrix[size - 8][8] = true;

    // 5. Reserve format info areas
    for (let i = 0; i < 9; i++) {
      if (matrix[8][i] === null) matrix[8][i] = false;
      if (matrix[i][8] === null) matrix[i][8] = false;
    }
    for (let i = size - 8; i < size; i++) {
      if (matrix[8][i] === null) matrix[8][i] = false;
      if (matrix[i][8] === null) matrix[i][8] = false;
    }

    // 6. Encode Data with Error Correction (Reed-Solomon)
    const dataBits = this._encodeDataBits(bytes, version);
    this._placeDataBits(matrix, dataBits);

    // 7. Apply standard mask pattern (Mask 0: (row + col) % 2 === 0)
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!this._isFunctionModule(r, c, size, version)) {
          if ((r + c) % 2 === 0) {
            matrix[r][c] = !matrix[r][c];
          }
        }
      }
    }

    // 8. Format Information (Mask 0 + ECC L: 0x77c4)
    this._applyFormatBits(matrix, 0x77c4, size);

    return matrix;
  }

  _determineVersion(length) {
    if (length <= 17) return 1;
    if (length <= 32) return 2;
    if (length <= 53) return 3;
    if (length <= 78) return 4;
    return 5;
  }

  _addFinderPattern(matrix, row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= matrix.length || nc < 0 || nc >= matrix.length) continue;
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const inCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[nr][nc] = inOuter && (isBorder || inCenter);
      }
    }
  }

  _addAlignmentPattern(matrix, row, col) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const nr = row + r;
        const nc = col + c;
        if (matrix[nr][nc] !== null) continue;
        const isBorder = Math.abs(r) === 2 || Math.abs(c) === 2;
        const isCenter = r === 0 && c === 0;
        matrix[nr][nc] = isBorder || isCenter;
      }
    }
  }

  _isFunctionModule(r, c, size, version) {
    // Finders
    if (r <= 8 && c <= 8) return true;
    if (r <= 8 && c >= size - 8) return true;
    if (r >= size - 8 && c <= 8) return true;
    // Timing
    if (r === 6 || c === 6) return true;
    // Dark module
    if (r === size - 8 && c === 8) return true;
    // Alignment
    if (version >= 2 && r >= size - 9 && r <= size - 5 && c >= size - 9 && c <= size - 5) return true;
    return false;
  }

  _applyFormatBits(matrix, formatBits, size) {
    for (let i = 0; i < 15; i++) {
      const bit = ((formatBits >> i) & 1) === 1;
      // Around top-left finder
      if (i < 6) matrix[i][8] = bit;
      else if (i === 6) matrix[7][8] = bit;
      else if (i === 7) matrix[8][8] = bit;
      else if (i === 8) matrix[8][7] = bit;
      else matrix[8][14 - i] = bit;

      // Split across bottom-left and top-right finders
      if (i < 8) matrix[8][size - 1 - i] = bit;
      else matrix[size - 15 + i][8] = bit;
    }
  }

  _encodeDataBits(bytes, version) {
    const bits = [];
    // Mode indicator: 0100 for Byte
    bits.push(0, 1, 0, 0);

    // Character count indicator (8 bits for Version 1-9)
    for (let i = 7; i >= 0; i--) {
      bits.push((bytes.length >> i) & 1);
    }

    // Data payload
    for (const b of bytes) {
      for (let i = 7; i >= 0; i--) {
        bits.push((b >> i) & 1);
      }
    }

    // Capacity in codewords for Version (ECC Level L)
    const capacities = [0, 19, 34, 55, 80, 108];
    const totalCodewords = [0, 26, 44, 70, 100, 134];
    const dataCapacity = capacities[version];
    const ecCount = totalCodewords[version] - dataCapacity;

    // Terminator (up to 4 zeroes)
    const maxDataBits = dataCapacity * 8;
    while (bits.length < maxDataBits && bits.length % 8 !== 0) bits.push(0);
    while (bits.length < maxDataBits && bits.length < maxDataBits - 4) bits.push(0, 0, 0, 0);
    while (bits.length < maxDataBits && bits.length % 8 !== 0) bits.push(0);

    // Convert bits to data codewords
    const dataCodewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let b = 0; b < 8; b++) byte = (byte << 1) | (bits[i + b] || 0);
      dataCodewords.push(byte);
    }

    // Pad bytes 0xEC, 0x11
    let pad = 0xEC;
    while (dataCodewords.length < dataCapacity) {
      dataCodewords.push(pad);
      pad = pad === 0xEC ? 0x11 : 0xEC;
    }

    // Calculate Reed-Solomon Error Correction Codewords
    const ecCodewords = this._calculateReedSolomon(dataCodewords, ecCount);

    // Merge data + error correction
    const finalCodewords = [...dataCodewords, ...ecCodewords];
    const finalBits = [];
    for (const cw of finalCodewords) {
      for (let i = 7; i >= 0; i--) {
        finalBits.push((cw >> i) & 1);
      }
    }

    return finalBits;
  }

  _calculateReedSolomon(data, ecCount) {
    // Galois Field GF(256) tables
    const exp = new Uint8Array(512);
    const log = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      exp[i] = x;
      exp[i + 255] = x;
      log[x] = i;
      x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
    }

    // Generator polynomial for ecCount
    let generator = [1];
    for (let i = 0; i < ecCount; i++) {
      const nextGen = new Array(generator.length + 1).fill(0);
      for (let j = 0; j < generator.length; j++) {
        nextGen[j] ^= generator[j] ? exp[(log[generator[j]] + exp[i]) % 255] : 0;
        nextGen[j + 1] ^= generator[j];
      }
      generator = nextGen;
    }

    // Polynomial division
    const remainder = new Array(ecCount).fill(0);
    for (const byte of data) {
      const factor = byte ^ remainder[0];
      remainder.shift();
      remainder.push(0);
      if (factor !== 0) {
        for (let j = 0; j < ecCount; j++) {
          if (generator[j] !== 0) {
            remainder[j] ^= exp[(log[generator[j]] + log[factor]) % 255];
          }
        }
      }
    }

    return remainder;
  }

  _placeDataBits(matrix, bits) {
    const size = matrix.length;
    let bitIndex = 0;
    let upward = true;

    for (let right = size - 1; right > 0; right -= 2) {
      if (right === 6) right--; // Skip vertical timing column

      for (let i = 0; i < size; i++) {
        const row = upward ? size - 1 - i : i;

        for (let col = right; col >= right - 1; col--) {
          if (matrix[row][col] === null) {
            matrix[row][col] = bitIndex < bits.length ? bits[bitIndex++] === 1 : false;
          }
        }
      }
      upward = !upward;
    }
  }
}

module.exports = new QrCodeGenerator();

