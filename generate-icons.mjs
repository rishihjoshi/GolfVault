// Generates icon-192.png and icon-512.png using raw PNG + zlib (no external deps)
import { createDeflate } from 'zlib';
import { writeFileSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Writable, Readable } from 'stream';

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, d])));
  return Buffer.concat([len, t, d, crcBuf]);
}

async function compressRows(rows) {
  const chunks = [];
  const raw = Buffer.concat(rows);
  await new Promise((res, rej) => {
    const deflate = createDeflate({ level: 9 });
    deflate.on('data', c => chunks.push(c));
    deflate.on('end', res);
    deflate.on('error', rej);
    deflate.end(raw);
  });
  return Buffer.concat(chunks);
}

// Hex colour → [r,g,b]
const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];

const GREEN   = hex('#1B4332');
const GOLD    = hex('#C9A84C');
const WHITE   = [255,255,255];

function dist(x, y, cx, cy) { return Math.sqrt((x-cx)**2 + (y-cy)**2); }

async function makePNG(size, outPath) {
  const rows = [];
  const cx = size / 2, cy = size / 2;
  const R  = size / 2;                    // outer radius (fill entire square)
  const ringR  = size * 0.45;             // gold ring outer
  const ringW  = size * 0.015;            // ring width
  const poleX  = size * 0.62;
  const poleY1 = size * 0.22;
  const poleY2 = size * 0.62;
  const poleW  = size * 0.02;
  const flagW  = size * 0.13;
  const flagH  = size * 0.08;

  // Text glyphs via pixel font (tiny 5×7 bitmaps) — we'll skip true text
  // and just draw a simple "GV" using rectangles & diagonals at readable size.

  for (let y = 0; y < size; y++) {
    const row = [0]; // filter byte = 0 (None)
    for (let x = 0; x < size; x++) {
      // 1. Background — rounded square using corner radii at 18%
      const cornerR = size * 0.18;
      let inBg = true;
      const qx = Math.min(x, size - x - 1);
      const qy = Math.min(y, size - y - 1);
      if (qx < cornerR && qy < cornerR) {
        inBg = dist(qx, qy, cornerR, cornerR) <= cornerR;
      }

      if (!inBg) {
        // Outside rounded rect → transparent (but PNG is RGB so use white bg)
        row.push(255, 255, 255);
        continue;
      }

      let pixel = GREEN;

      // 2. Gold ring
      const d = dist(x, y, cx, cy);
      if (d >= ringR - ringW && d <= ringR) {
        pixel = GOLD;
      }

      // 3. Flag pole
      if (x >= poleX - poleW && x <= poleX + poleW && y >= poleY1 && y <= poleY2) {
        pixel = GOLD;
      }

      // 4. Flag triangle (right-pointing from pole)
      const flagBase = poleY1 + flagH / 2;
      if (x >= poleX && x <= poleX + flagW) {
        const prog = (x - poleX) / flagW;
        const halfH = flagH / 2 * (1 - prog);
        if (y >= flagBase - halfH && y <= flagBase + halfH) {
          pixel = GOLD;
        }
      }

      // 5. Letter G (left side, ~15–45% x, 30–72% y)
      const gx1 = size * 0.12, gx2 = size * 0.44;
      const gy1 = size * 0.30, gy2 = size * 0.72;
      const gStroke = size * 0.045;
      const gCx = (gx1 + gx2) / 2, gCy = (gy1 + gy2) / 2;
      const gRx = (gx2 - gx1) / 2, gRy = (gy2 - gy1) / 2;
      const gDist = ((x-gCx)/gRx)**2 + ((y-gCy)/gRy)**2;
      if (gDist >= (1 - gStroke/gRx)**2 && gDist <= 1) {
        // Ellipse arc → draw only left+top+bottom (cut right side for G)
        const angle = Math.atan2((y - gCy) / gRy, (x - gCx) / gRx);
        if (angle > -Math.PI * 0.8 && angle < Math.PI * 0.8) {
          pixel = WHITE;
        }
      }
      // G crossbar (right middle of the G)
      const gBarX1 = gCx - gStroke * 0.5, gBarX2 = gx2 - gStroke;
      const gBarY1 = gCy - gStroke * 0.6, gBarY2 = gCy + gStroke * 0.6;
      if (x >= gBarX1 && x <= gBarX2 && y >= gBarY1 && y <= gBarY2) {
        pixel = WHITE;
      }
      // G vertical stem (right side, lower half of crossbar)
      const gStemX1 = gx2 - gStroke * 2, gStemX2 = gx2 - gStroke * 0.5;
      const gStemY1 = gCy, gStemY2 = gy2 - gStroke;
      if (x >= gStemX1 && x <= gStemX2 && y >= gStemY1 && y <= gStemY2) {
        pixel = WHITE;
      }

      // 6. Letter V (right side, ~50–88% x)
      const vx1 = size * 0.50, vx2 = size * 0.88;
      const vy1 = size * 0.30, vy2 = size * 0.72;
      const vMidX = (vx1 + vx2) / 2;
      const vStroke = size * 0.045;
      // Left diagonal of V
      const slope = (vy2 - vy1) / (vMidX - vx1);
      const leftLine = vy1 + slope * (x - vx1);
      if (x >= vx1 && x <= vMidX && y >= vy1 && y <= vy2) {
        const lineDist = Math.abs(y - leftLine) / Math.sqrt(1 + slope * slope);
        if (lineDist <= vStroke / 2) pixel = GOLD;
      }
      // Right diagonal of V
      const slopeR = (vy1 - vy2) / (vx2 - vMidX);
      const rightLine = vy2 + slopeR * (x - vMidX);
      if (x >= vMidX && x <= vx2 && y >= vy1 && y <= vy2) {
        const lineDist = Math.abs(y - rightLine) / Math.sqrt(1 + slopeR * slopeR);
        if (lineDist <= vStroke / 2) pixel = GOLD;
      }

      row.push(...pixel);
    }
    rows.push(Buffer.from(row));
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);   // bit depth
  ihdr.writeUInt8(2, 9);   // colour type: RGB
  ihdr.writeUInt8(0, 10);  // compression
  ihdr.writeUInt8(0, 11);  // filter
  ihdr.writeUInt8(0, 12);  // interlace

  const sig   = Buffer.from([137,80,78,71,13,10,26,10]);
  const idat  = await compressRows(rows);
  const iend  = Buffer.alloc(0);

  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', iend)
  ]);
  writeFileSync(outPath, png);
  console.log(`✅ ${outPath} (${size}×${size}, ${(png.length/1024).toFixed(1)} KB)`);
}

await makePNG(192, 'docs/icons/icon-192.png');
await makePNG(512, 'docs/icons/icon-512.png');
console.log('Icons generated successfully.');
