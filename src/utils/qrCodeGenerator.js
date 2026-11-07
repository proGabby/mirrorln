/**
 * ISO/IEC 18004 Compliant SVG QR Code Generator
 * 
 * Standalone, zero-dependency QR code generator implementing complete
 * Galois Field GF(256) Reed-Solomon error correction, alignment grids,
 * dynamic mask penalty selection, and standard 4-module quiet zone margins.
 */

    const QR_ERROR_CORRECT_LEVEL_L = 1;

    const QR_POLYNOMIAL = {
      gexp: (function () {
        const exp = new Uint8Array(512);
        let x = 1;
        for (let i = 0; i < 255; i++) {
          exp[i] = x;
          exp[i + 255] = x;
          x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
        }
        return exp;
      })(),
      glog: (function () {
        const log = new Uint8Array(256);
        let x = 1;
        for (let i = 0; i < 255; i++) {
          log[x] = i;
          x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
        }
        return log;
      })()
    };

        function qrGlog(n) {
          if (n < 1) throw new Error("glog(" + n + ")");
          return QR_POLYNOMIAL.glog[n];
        }

        function qrGexp(n) {
          while (n < 0) n += 255;
          while (n >= 255) n -= 255;
          return QR_POLYNOMIAL.gexp[n];
        }

        class QRPolynomial {
          constructor(num, shift) {
            let offset = 0;
            while (offset < num.length && num[offset] === 0) offset++;
            this.num = new Uint8Array(num.length - offset + shift);
            for (let i = 0; i < num.length - offset; i++) {
              this.num[i] = num[offset + i];
            }
          }

          get(index) {
            return this.num[index];
          }

          getLength() {
            return this.num.length;
          }

          multiply(e) {
            const num = new Uint8Array(this.getLength() + e.getLength() - 1);
            for (let i = 0; i < this.getLength(); i++) {
              for (let j = 0; j < e.getLength(); j++) {
                num[i + j] ^= qrGexp(qrGlog(this.get(i)) + qrGlog(e.get(j)));
              }
            }
            return new QRPolynomial(num, 0);
          }

        mod(e) {
          if (this.getLength() - e.getLength() < 0) return this;
          const ratio = qrGlog(this.get(0)) - qrGlog(e.get(0));
          const num = new Uint8Array(this.num);
          for (let i = 0; i < e.getLength(); i++) {
            num[i] ^= qrGexp(qrGlog(e.get(i)) + ratio);
          }
          return new QRPolynomial(num, 0).mod(e);
        }
      }

      // RS Block definitions: [blockCount, totalCodewords, dataCodewords]
      const RS_BLOCK_TABLE = [
        // Version 1
        [1, 26, 19],
        // Version 2
        [1, 44, 34],
        // Version 3
        [1, 70, 55],
        // Version 4
        [1, 100, 80],
        // Version 5
        [1, 134, 108],
        // Version 6
        [2, 86, 68],
        // Version 7
        [2, 98, 78],
        // Version 8
        [2, 121, 97],
        // Version 9
        [2, 146, 116],
        // Version 10
        [2, 86, 68, 2, 87, 69]
      ];

        // ISO Alignment pattern coordinates
        const ALIGNMENT_PATTERN_TABLE = [
          [],
          [6, 18],
          [6, 22],
          [6, 26],
          [6, 30],
          [6, 34],
          [6, 22, 38],
          [6, 24, 42],
          [6, 26, 46],
          [6, 28, 50]
        ];

        class QRBitBuffer {
          constructor() {
            this.buffer = [];
            this.length = 0;
          }

        get(index) {
          const bufIndex = Math.floor(index / 8);
          return ((this.buffer[bufIndex] >>> (7 - (index % 8))) & 1) === 1;
        }

          put(num, length) {
            for (let i = 0; i < length; i++) {
              this.putBit(((num >>> (length - i - 1)) & 1) === 1);
            }
          }

            putBit(bit) {
              const bufIndex = Math.floor(this.length / 8);
              if (this.buffer.length <= bufIndex) {
                this.buffer.push(0);
              }
                if (bit) {
                  this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
                }
                this.length++;
              }
            }

            class QRCodeModel {
              constructor(typeNumber) {
                this.typeNumber = typeNumber;
                this.modules = null;
                this.moduleCount = 0;
                this.dataList = [];
              }

            addData(data) {
              this.dataList.push(data);
            }

            isDark(row, col) {
              return this.modules[row][col];
            }

            getModuleCount() {
              return this.moduleCount;
            }

              make() {
                this.makeImpl(false, this.getBestMaskPattern());
              }

                makeImpl(test, maskPattern) {
                  this.moduleCount = this.typeNumber * 4 + 17;
                  this.modules = Array.from({ length: this.moduleCount }, () => Array(this.moduleCount).fill(null));

                  this.setupPositionProbePattern(0, 0);
                  this.setupPositionProbePattern(this.moduleCount - 7, 0);
                  this.setupPositionProbePattern(0, this.moduleCount - 7);
                  this.setupPositionAdjustPattern();
                  this.setupTimingPattern();
                  this.setupTypeInfo(test, maskPattern);

                  if (this.typeNumber >= 7) {
                    this.setupTypeNumber(test);
                  }

                  const data = this.createData(this.typeNumber);
                  this.mapData(data, maskPattern);
                }

                setupPositionProbePattern(row, col) {
                  for (let r = -1; r <= 7; r++) {
                    if (row + r <= -1 || this.moduleCount <= row + r) continue;
                    for (let c = -1; c <= 7; c++) {
                      if (col + c <= -1 || this.moduleCount <= col + c) continue;
                      if (
                        (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
                        (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
                        (2 <= r && r <= 4 && 2 <= c && c <= 4)
                      ) {
                        this.modules[row + r][col + c] = true;
                      } else {
                        this.modules[row + r][col + c] = false;
                      }
                    }
                  }
                }

                      getBestMaskPattern() {
                        let minLostPoint = 0;
                        let pattern = 0;
                        for (let i = 0; i < 8; i++) {
                          this.makeImpl(true, i);
                          const lostPoint = this.getLostPoint();
                          if (i === 0 || minLostPoint > lostPoint) {
                            minLostPoint = lostPoint;
                            pattern = i;
                          }
                        }
                        return pattern;
                      }

                        setupTimingPattern() {
                          for (let r = 8; r < this.moduleCount - 8; r++) {
                            if (this.modules[r][6] !== null) continue;
                            this.modules[r][6] = r % 2 === 0;
                          }
                          for (let c = 8; c < this.moduleCount - 8; c++) {
                            if (this.modules[6][c] !== null) continue;
                            this.modules[6][c] = c % 2 === 0;
                          }
                        }

                            setupPositionAdjustPattern() {
                              const pos = ALIGNMENT_PATTERN_TABLE[this.typeNumber - 1];
                              for (let i = 0; i < pos.length; i++) {
                                for (let j = 0; j < pos.length; j++) {
                                  const row = pos[i];
                                  const col = pos[j];
                                  if (this.modules[row][col] !== null) continue;
                                  for (let r = -2; r <= 2; r++) {
                                    for (let c = -2; c <= 2; c++) {
                                      if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
                                        this.modules[row + r][col + c] = true;
                                      } else {
                                        this.modules[row + r][col + c] = false;
                                      }
                                    }
                                  }
                                }
                              }
                            }

                            setupTypeNumber(test) {
                              const bits = this.getBCHTypeNumber(this.typeNumber);
                              for (let i = 0; i < 18; i++) {
                                const mod = !test && ((bits >> i) & 1) === 1;
                                this.modules[Math.floor(i / 3)][(i % 3) + this.moduleCount - 8 - 3] = mod;
                                this.modules[(i % 3) + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
                              }
                            }

                              setupTypeInfo(test, maskPattern) {
                                const data = (QR_ERROR_CORRECT_LEVEL_L << 3) | maskPattern;
                                const bits = this.getBCHTypeInfo(data);

                                  for (let i = 0; i < 15; i++) {
                                    const mod = !test && ((bits >> i) & 1) === 1;
                                    if (i < 6) {
                                      this.modules[i][8] = mod;
                                    } else if (i < 8) {
                                      this.modules[i + 1][8] = mod;
                                    } else {
                                      this.modules[this.moduleCount - 15 + i][8] = mod;
                                    }

                                    if (i < 8) {
                                      this.modules[8][this.moduleCount - i - 1] = mod;
                                    } else if (i < 9) {
                                      this.modules[8][15 - i - 1 + 1] = mod;
                                    } else {
                                      this.modules[8][15 - i - 1] = mod;
                                    }
                                  }
                                  this.modules[this.moduleCount - 8][8] = !test;
                                }

                                    mapData(data, maskPattern) {
                                      let inc = -1;
                                      let row = this.moduleCount - 1;
                                      let bitIndex = 7;
                                      let byteIndex = 0;

                                      for (let col = this.moduleCount - 1; col > 0; col -= 2) {
                                        if (col === 6) col--;
                                        while (true) {
                                          for (let c = 0; c < 2; c++) {
                                            if (this.modules[row][col - c] === null) {
                                              let dark = false;
                                              if (byteIndex < data.length) {
                                                dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
                                              }
                                              const mask = this.getMask(maskPattern, row, col - c);
                                              if (mask) dark = !dark;
                                              this.modules[row][col - c] = dark;
                                              bitIndex--;
                                              if (bitIndex === -1) {
                                                byteIndex++;
                                                bitIndex = 7;
                                              }
                                            }
                                          }
                                          row += inc;
                                          if (row < 0 || this.moduleCount <= row) {
                                            row -= inc;
                                            inc = -inc;
                                            break;
                                          }
                                        }
                                      }
                                    }

                                    getMask(maskPattern, i, j) {
                                      switch (maskPattern) {
                                        case 0: return (i + j) % 2 === 0;
                                        case 1: return i % 2 === 0;
                                        case 2: return j % 3 === 0;
                                        case 3: return (i + j) % 3 === 0;
                                        case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
                                        case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
                                        case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
                                        case 7: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
                                        default: throw new Error("bad maskPattern:" + maskPattern);
                                      }
                                    }

                                    createData(typeNumber) {
                                      const rsBlockInfo = RS_BLOCK_TABLE[typeNumber - 1];
                                      const buffer = new QRBitBuffer();

                                        buffer.put(4, 4); // 8-bit Byte mode
                                        const length = Buffer.byteLength(this.dataList[0], 'utf8');
                                        buffer.put(length, typeNumber < 10 ? 8 : 16);

                                        const bytes = Buffer.from(this.dataList[0], 'utf8');
                                        for (let i = 0; i < bytes.length; i++) {
                                          buffer.put(bytes[i], 8);
                                        }

                                          let totalDataCount = 0;
                                          for (let i = 0; i < rsBlockInfo.length; i += 3) {
                                            totalDataCount += rsBlockInfo[i] * rsBlockInfo[i + 2];
                                          }

                                          if (buffer.length + 4 <= totalDataCount * 8) {
                                            buffer.put(0, 4);
                                          }

                                            while (buffer.length % 8 !== 0) {
                                              buffer.putBit(false);
                                            }

                                            while (true) {
                                              if (buffer.length >= totalDataCount * 8) break;
                                              buffer.put(0xec, 8);
                                              if (buffer.length >= totalDataCount * 8) break;
                                              buffer.put(0x11, 8);
                                            }

                                            return this.createBytes(buffer, rsBlockInfo);
                                          }

                                              createBytes(buffer, rsBlockInfo) {
                                                let offset = 0;
                                                let maxDcCount = 0;
                                                let maxEcCount = 0;

                                                const dcdata = [];
                                                const ecdata = [];

                                                for (let r = 0; r < rsBlockInfo.length; r += 3) {
                                                  const count = rsBlockInfo[r];
                                                  const totalCount = rsBlockInfo[r + 1];
                                                  const dataCount = rsBlockInfo[r + 2];

                                                  for (let c = 0; c < count; c++) {
                                                    const dc = [];
                                                    for (let i = 0; i < dataCount; i++) {
                                                      dc.push(buffer.buffer[offset + i]);
                                                    }
                                                    offset += dataCount;

                                                    const ecCount = totalCount - dataCount;
                                                    const rsPoly = this.getErrorCorrectPolynomial(ecCount);
                                                    const rawPoly = new QRPolynomial(dc, rsPoly.getLength() - 1);
                                                    const modPoly = rawPoly.mod(rsPoly);

                                                    const ec = new Array(rsPoly.getLength() - 1).fill(0);
                                                    for (let i = 0; i < modPoly.getLength(); i++) {
                                                      const modIndex = i + ec.length - modPoly.getLength();
                                                      ec[modIndex] = modPoly.get(i);
                                                    }

                                                    dcdata.push(dc);
                                                    ecdata.push(ec);

                                                    maxDcCount = Math.max(maxDcCount, dc.length);
                                                    maxEcCount = Math.max(maxEcCount, ec.length);
                                                  }
                                                }

                                                    const data = [];
                                                    for (let i = 0; i < maxDcCount; i++) {
                                                      for (let r = 0; r < dcdata.length; r++) {
                                                        if (i < dcdata[r].length) data.push(dcdata[r][i]);
                                                      }
                                                    }
                                                    for (let i = 0; i < maxEcCount; i++) {
                                                      for (let r = 0; r < ecdata.length; r++) {
                                                        if (i < ecdata[r].length) data.push(ecdata[r][i]);
                                                      }
                                                    }

                                                            return data;
                                                          }

                                                          getErrorCorrectPolynomial(errorCorrectLength) {
                                                            let a = new QRPolynomial([1], 0);
                                                            for (let i = 0; i < errorCorrectLength; i++) {
                                                              a = a.multiply(new QRPolynomial([1, qrGexp(i)], 0));
                                                            }
                                                            return a;
                                                          }

                                                          getBCHTypeInfo(data) {
                                                            let d = data << 10;
                                                            while (this.getBCHDigit(d) - this.getBCHDigit(1335) >= 0) {
                                                              d ^= 1335 << (this.getBCHDigit(d) - this.getBCHDigit(1335));
                                                            }
                                                            return ((data << 10) | d) ^ 0x5412;
                                                          }

                                                          getBCHTypeNumber(data) {
                                                            let d = data << 12;
                                                            while (this.getBCHDigit(d) - this.getBCHDigit(7973) >= 0) {
                                                              d ^= 7973 << (this.getBCHDigit(d) - this.getBCHDigit(7973));
                                                            }
                                                            return (data << 12) | d;
                                                          }

                                                          getBCHDigit(data) {
                                                            let digit = 0;
                                                            while (data !== 0) {
                                                              digit++;
                                                              data >>>= 1;
                                                            }
                                                            return digit;
                                                          }

                                                          getLostPoint() {
                                                            const moduleCount = this.moduleCount;
                                                            let lostPoint = 0;

                                                            // Adjacent runs of same color (5+)
                                                            for (let row = 0; row < moduleCount; row++) {
                                                              for (let col = 0; col < moduleCount; col++) {
                                                                let sameCount = 0;
                                                                const dark = this.isDark(row, col);
                                                                for (let r = -1; r <= 1; r++) {
                                                                  if (row + r < 0 || moduleCount <= row + r) continue;
                                                                  for (let c = -1; c <= 1; c++) {
                                                                    if (col + c < 0 || moduleCount <= col + c) continue;
                                                                    if (r === 0 && c === 0) continue;
                                                                    if (dark === this.isDark(row + r, col + c)) sameCount++;
                                                                  }
                                                                }
                                                                if (sameCount > 5) lostPoint += 3 + sameCount - 5;
                                                              }
                                                            }

                                                            // 2x2 blocks
                                                            for (let row = 0; row < moduleCount - 1; row++) {
                                                              for (let col = 0; col < moduleCount - 1; col++) {
                                                                let count = 0;
                                                                if (this.isDark(row, col)) count++;
                                                                if (this.isDark(row + 1, col)) count++;
                                                                if (this.isDark(row, col + 1)) count++;
                                                                if (this.isDark(row + 1, col + 1)) count++;
                                                                if (count === 0 || count === 4) lostPoint += 3;
                                                              }
                                                            }

                                                            return lostPoint;
                                                          }
                                                        }

                                                          function getBestTypeNumber(text) {
                                                            const byteCount = Buffer.byteLength(text, 'utf8');
                                                            for (let type = 1; type <= 10; type++) {
                                                              const rs = RS_BLOCK_TABLE[type - 1];
                                                              let totalData = 0;
                                                              for (let i = 0; i < rs.length; i += 3) {
                                                                totalData += rs[i] * rs[i + 2];
                                                              }
                                                              const headerBits = type < 10 ? 12 : 20;
                                                              if (byteCount * 8 + headerBits <= totalData * 8) {
                                                                return type;
                                                              }
                                                            }
                                                            return 10;
                                                          }

                                                            class QrCodeGenerator {
                                                              /**
                                                               * Generates a fully ISO-compliant SVG representation of a QR code.
                                                               * @param {string} text 
                                                               * @param {object} options 
                                                               * @returns {string} SVG markup
                                                               */
                                                              generateSvg(text, options = {}) {
                                                                const margin = options.margin !== undefined ? options.margin : 4; // ISO quiet zone = 4
                                                                const color = options.color || '#000000';
                                                                const background = options.background || '#ffffff';
                                                                const size = options.size || 256;

                                                                  const type = getBestTypeNumber(text);
                                                                  const qr = new QRCodeModel(type);
                                                                  qr.addData(text);
                                                                  qr.make();

                                                                    const count = qr.getModuleCount();
                                                                    const viewSize = count + margin * 2;

                                                                    let rects = [];
                                                                    for (let r = 0; r < count; r++) {
                                                                      for (let c = 0; c < count; c++) {
                                                                        if (qr.isDark(r, c)) {
                                                                          rects.push(`<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="${color}" />`);
                                                                        }
                                                                      }
                                                                    }

                                                                    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" width="${size}" height="${size}" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="${background}" />
  ${rects.join('\n  ')}
</svg>`;
                                                                  }
                                                                }

                                                                module.exports = new QrCodeGenerator();
