// Generates the Clubhouse Golf icon set from the vector mark in brand-mark.mjs.
//
// Nothing here upscales a raster: the monogram is defined as analytic geometry
// and supersampled straight to the target resolution, so a 1024 app icon is as
// crisp as the 192. Raw PNG + zlib keeps the project at zero dependencies.
//
//   node generate-icons.mjs
//
// Outputs:
//   docs/assets/clubhouse-mark.svg        mark on transparent, for dark grounds
//   docs/assets/clubhouse-mark-light.svg  mark on transparent, for ivory grounds
//   docs/icons/icon.svg                   rounded green app icon
//   docs/icons/icon-maskable.svg          full-bleed green, inner-80% safe zone
//   docs/icons/icon-192.png, icon-512.png, clubhouse-golf-app-icon.png (1024)
//   docs/icons/clubhouse-golf-app-hero.png (874x1024 share / screenshot panel)

import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';
import { BRAND, toSVG, sampler, RGB } from './brand-mark.mjs';

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

function encodePNG(width, height, rgb) {
  const stride = width * 3;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (stride + 1)] = 0;                       // filter: None
    rgb.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;                           // 8-bit truecolour
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Rasteriser ───────────────────────────────────────────────────────────────
// Box-filtered supersampling: SSxSS samples per pixel, averaged. The mark is
// hard-edged geometry, so this is the whole of the anti-aliasing story.
const SS = 4;

// Draws the mark centred in `w x h` at `frac` of the shorter side, over `bg`.
// `dy` nudges the mark off-centre (the portrait panel wants it high). `rule`
// paints a gold bar under it — the panel's stand-in for the wordmark, which
// cannot be typeset here without shipping a font rasteriser.
function render(w, h, { scheme = 'dark', bg, frac = 0.72, dy = 0, rule = null }) {
  const hit = sampler(scheme);
  const bgRGB = RGB(bg);
  const ruleRGB = rule ? RGB(BRAND.gold) : null;
  const span = Math.min(w, h) * frac;          // mark's on-canvas edge length
  const ox = (w - span) / 2, oy = (h - span) / 2 + dy;
  const out = Buffer.alloc(w * h * 3);
  const inv = 100 / span;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        const uy = (py + (sy + 0.5) / SS - oy) * inv;
        for (let sx = 0; sx < SS; sx++) {
          const ux = (px + (sx + 0.5) / SS - ox) * inv;
          const gx = px + (sx + 0.5) / SS, gy = py + (sy + 0.5) / SS;
          const onRule = rule && Math.abs(gx - w / 2) <= rule.w / 2 &&
                         gy >= rule.y && gy <= rule.y + rule.h;
          const c = ux < 0 || ux > 100 || uy < 0 || uy > 100 ? null : hit(ux, uy);
          const p = c || (onRule ? ruleRGB : bgRGB);
          r += p[0]; g += p[1]; b += p[2];
        }
      }
      const d = (py * w + px) * 3, k = SS * SS;
      out[d] = Math.round(r / k); out[d + 1] = Math.round(g / k); out[d + 2] = Math.round(b / k);
    }
  }
  return out;
}

function emit(path, w, h, opts) {
  const png = encodePNG(w, h, render(w, h, opts));
  writeFileSync(path, png);
  console.log(`  ${path} — ${w}x${h}, ${(png.length / 1024).toFixed(1)} KB`);
}

// ── Build ────────────────────────────────────────────────────────────────────
console.log('Clubhouse Golf marks — deep green / ivory / muted gold\n');

// SVG marks used inside the app. Transparent ground so one file works on the
// hero panel, the header and anywhere else the ground colour changes.
writeFileSync('docs/assets/clubhouse-mark.svg',       toSVG({ scheme: 'dark',  size: 512 }));
writeFileSync('docs/assets/clubhouse-mark-light.svg', toSVG({ scheme: 'light', size: 512 }));
console.log('  docs/assets/clubhouse-mark.svg + clubhouse-mark-light.svg');

// Favicon / manifest SVGs. Maskable pulls the mark in to the inner 80% safe
// zone and drops the corner radius, since the platform applies its own.
writeFileSync('docs/icons/icon.svg',          toSVG({ bg: BRAND.green, radius: 22, pad: 13, size: 512 }));
writeFileSync('docs/icons/icon-maskable.svg', toSVG({ bg: BRAND.green, radius: 0,  pad: 21, size: 512 }));
console.log('  docs/icons/icon.svg + icon-maskable.svg');

emit('docs/icons/icon-192.png',                 192,  192,  { bg: BRAND.green, frac: 0.74 });
emit('docs/icons/icon-512.png',                 512,  512,  { bg: BRAND.green, frac: 0.74 });
emit('docs/icons/clubhouse-golf-app-icon.png',  1024, 1024, { bg: BRAND.green, frac: 0.74 });

// Share / manifest-screenshot panel: portrait onyx field, mark centred high.
emit('docs/icons/clubhouse-golf-app-hero.png',  874,  1024, {
  bg: BRAND.onyx, frac: 0.62, dy: -60, rule: { w: 168, h: 5, y: 700 },
});

console.log('\nIcon set regenerated from the vector brand mark.');
