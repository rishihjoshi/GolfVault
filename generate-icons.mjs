// Generates the Clubhouse Golf icon set from docs/assets/clubhouse-logo.png.
//
// Everything here is raw PNG + zlib so the project keeps zero dependencies.
// The source logo is white line art on a solid #0A0B0B field — the same ink
// as the brand surface — so it composites onto an ink canvas seamlessly with
// no alpha work needed.
//
//   node generate-icons.mjs
//
// Outputs: icon-192.png, icon-512.png, clubhouse-golf-app-icon.png (1024),
//          clubhouse-golf-app-hero.png (874x1024 share/screenshot panel).
// The two SVGs (icon.svg, icon-maskable.svg) embed the same logo as a data
// URI and are written here too, so every mark comes from one source file.

import { inflateSync, deflateSync } from 'zlib';
import { readFileSync, writeFileSync } from 'fs';

const SRC = 'docs/assets/clubhouse-logo.png';
const INK = [0x0a, 0x0b, 0x0b];

// ── CRC32 / chunk plumbing ───────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, d])));
  return Buffer.concat([len, t, d, crc]);
}

// ── Decode: 8-bit RGB/RGBA, all five filter types ────────────────────────────
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
  const depth = buf[24], colorType = buf[25];
  if (depth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG: depth=${depth} colorType=${colorType} (need 8-bit RGB or RGBA)`);
  }
  const channels = colorType === 6 ? 4 : 3;

  let idat = [], i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    if (type === 'IDAT') idat.push(buf.subarray(i + 8, i + 8 + len));
    if (type === 'IEND') break;
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));

  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride), pos = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels, d = (y * width + x) * 4;
      out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2];
      out[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

function encodePNG({ width, height, data }) {
  const stride = width * 3;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (stride + 1)] = 0;               // filter: None
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4, d = y * (stride + 1) + 1 + x * 3;
      rows[d] = data[s]; rows[d + 1] = data[s + 1]; rows[d + 2] = data[s + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Catmull-Rom resample. Bilinear turns 2-3x upscaled line art to mush;
//    a cubic keeps the stroke edges from smearing as badly. ─────────────────
function resample(src, dw, dh) {
  const { width: sw, height: sh, data } = src;
  const out = Buffer.alloc(dw * dh * 4);
  const px = (x, y, c) => data[((Math.min(sh - 1, Math.max(0, y)) * sw) + Math.min(sw - 1, Math.max(0, x))) * 4 + c];
  const k = t => {                                    // Catmull-Rom basis
    const a = Math.abs(t);
    if (a <= 1) return 1.5 * a ** 3 - 2.5 * a ** 2 + 1;
    if (a <= 2) return -0.5 * a ** 3 + 2.5 * a ** 2 - 4 * a + 2;
    return 0;
  };
  for (let y = 0; y < dh; y++) {
    const sy = (y + 0.5) * sh / dh - 0.5, iy = Math.floor(sy), fy = sy - iy;
    for (let x = 0; x < dw; x++) {
      const sx = (x + 0.5) * sw / dw - 0.5, ix = Math.floor(sx), fx = sx - ix;
      for (let c = 0; c < 4; c++) {
        let sum = 0, wsum = 0;
        for (let m = -1; m <= 2; m++) {
          const wy = k(m - fy);
          for (let n = -1; n <= 2; n++) {
            const w = wy * k(n - fx);
            sum += px(ix + n, iy + m, c) * w; wsum += w;
          }
        }
        out[(y * dw + x) * 4 + c] = Math.max(0, Math.min(255, Math.round(sum / (wsum || 1))));
      }
    }
  }
  return { width: dw, height: dh, data: out };
}

function canvas(w, h, rgb) {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

// Source alpha is 255 everywhere, but honour it anyway so a future
// transparent logo drops in without touching this.
function composite(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    const dy = oy + y; if (dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = ox + x; if (dx < 0 || dx >= dst.width) continue;
      const s = (y * src.width + x) * 4, d = (dy * dst.width + dx) * 4;
      const a = src.data[s + 3] / 255;
      for (let c = 0; c < 3; c++) dst.data[d + c] = Math.round(src.data[s + c] * a + dst.data[d + c] * (1 - a));
    }
  }
}

// Fit the logo into `frac` of the canvas width, centred.
function makeIcon(logo, size, frac) {
  const c = canvas(size, size, INK);
  const lw = Math.round(size * frac);
  const lh = Math.round(lw * logo.height / logo.width);
  composite(c, resample(logo, lw, lh), Math.round((size - lw) / 2), Math.round((size - lh) / 2));
  return c;
}

// ── Build ────────────────────────────────────────────────────────────────────
const logo = decodePNG(readFileSync(SRC));
console.log(`source ${SRC} — ${logo.width}x${logo.height}`);

const targets = [
  // Standard icons keep breathing room; maskable-safe zone is the inner 80%,
  // and 0.62 keeps the wordmark inside it at every size.
  ['docs/icons/icon-192.png', 192, 0.72],
  ['docs/icons/icon-512.png', 512, 0.72],
  ['docs/icons/clubhouse-golf-app-icon.png', 1024, 0.72],
];
for (const [path, size, frac] of targets) {
  const png = encodePNG(makeIcon(logo, size, frac));
  writeFileSync(path, png);
  console.log(`  ${path} — ${size}x${size}, ${(png.length / 1024).toFixed(1)} KB`);
}

// Share / manifest-screenshot panel: portrait ink field, logo centred high.
{
  const W = 874, H = 1024;
  const c = canvas(W, H, INK);
  const lw = Math.round(W * 0.72);
  const lh = Math.round(lw * logo.height / logo.width);
  composite(c, resample(logo, lw, lh), Math.round((W - lw) / 2), Math.round((H - lh) / 2));
  const png = encodePNG(c);
  writeFileSync('docs/icons/clubhouse-golf-app-hero.png', png);
  console.log(`  docs/icons/clubhouse-golf-app-hero.png — ${W}x${H}, ${(png.length / 1024).toFixed(1)} KB`);
}

// ── SVGs embed the same logo so there is one source of truth. External refs
//    never load in SVG-as-image contexts (favicon, manifest), hence data URI.
{
  const b64 = readFileSync(SRC).toString('base64');
  const href = `data:image/png;base64,${b64}`;
  const ar = logo.height / logo.width;

  const svg = (size, frac, radius) => {
    const lw = +(size * frac).toFixed(1), lh = +(lw * ar).toFixed(1);
    const x = +((size - lw) / 2).toFixed(1), y = +((size - lh) / 2).toFixed(1);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <title>Clubhouse Golf</title>
  <rect width="${size}" height="${size}"${radius ? ` rx="${radius}"` : ''} fill="#0A0B0B"/>
  <image href="${href}" x="${x}" y="${y}" width="${lw}" height="${lh}"/>
</svg>
`;
  };
  writeFileSync('docs/icons/icon.svg', svg(512, 0.74, 96));
  writeFileSync('docs/icons/icon-maskable.svg', svg(512, 0.60, 0));  // inner 80% safe zone
  console.log('  docs/icons/icon.svg + icon-maskable.svg — logo embedded as data URI');
}

console.log('\nIcon set regenerated from the Clubhouse Golf logo.');
