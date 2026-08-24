// Clubhouse Golf brand mark — one geometric definition, two renderers.
//
// The mark is the "C" monogram: a deep-green ring opening to the right, a golf
// ball filling its counter, the clubhouse portico standing on the ball, and a
// gold pin flying out through the opening.
//
// Everything is defined once, in a 100x100 unit box, as analytic primitives
// (discs, an annulus sector, rects, polygons). `toSVG` writes those primitives
// out as SVG elements; `sample` answers "what colour is this point" so the
// rasteriser in generate-icons.mjs can supersample the exact same geometry.
// One source of truth means the favicon, the PNG icons and the in-app logo can
// never drift apart, and none of them is ever an upscaled raster.

// ── Brand palette ────────────────────────────────────────────────────────────
export const BRAND = {
  green:    '#0B2F24',   // Deep Clubhouse Green — primary
  onyx:     '#0A0D0C',   // Almost black — premium surfaces
  gold:     '#C49A43',   // Muted Masters gold — flag, accents
  ivory:    '#F2EFE8',   // Warm ivory — wordmark, light ground
  sage:     '#53695C',   // Muted sage — secondary green
  charcoal: '#252B28',   // Supporting neutral
};

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ── Geometry constants (100x100 box, mark centred on 50,50) ──────────────────
const CX = 50, CY = 50;
const R_OUT = 42, R_IN = 32.5;   // ring outer / inner radius
const GAP = 58;                  // half-angle of the opening, degrees
const BALL_R = 31;               // golf ball fills the counter

// ── Primitives. Each carries a bbox (for cheap rejection) and a hit test. ────
const deg = a => (a * Math.PI) / 180;

function disc(cx, cy, r, fill) {
  return {
    fill, bbox: [cx - r, cy - r, cx + r, cy + r],
    hit: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r,
    svg: () => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"/>`,
  };
}

function rect(x0, y0, w, h, fill) {
  const x1 = x0 + w, y1 = y0 + h;
  return {
    fill, bbox: [x0, y0, x1, y1],
    hit: (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1,
    svg: () => `<rect x="${n(x0)}" y="${n(y0)}" width="${n(w)}" height="${n(h)}" fill="${fill}"/>`,
  };
}

function poly(pts, fill) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return {
    fill, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    // Even-odd crossing test.
    hit: (x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    },
    svg: () => `<polygon points="${pts.map(p => `${n(p[0])},${n(p[1])}`).join(' ')}" fill="${fill}"/>`,
  };
}

// Annulus sector: the "C". Angles are measured the usual mathematical way
// (counter-clockwise from east) on a y-down canvas, so `up` is positive.
function ringSector(cx, cy, rOut, rIn, aStart, aEnd, fill) {
  const pt = (r, a) => [cx + r * Math.cos(deg(a)), cy - r * Math.sin(deg(a))];
  const span = aEnd - aStart;
  const large = span > 180 ? 1 : 0;
  const [ox0, oy0] = pt(rOut, aStart), [ox1, oy1] = pt(rOut, aEnd);
  const [ix1, iy1] = pt(rIn, aEnd), [ix0, iy0] = pt(rIn, aStart);
  return {
    fill, bbox: [cx - rOut, cy - rOut, cx + rOut, cy + rOut],
    hit: (x, y) => {
      const dx = x - cx, dy = cy - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > rOut * rOut || d2 < rIn * rIn) return false;
      let a = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (a < 0) a += 360;
      return a >= aStart && a <= aEnd;
    },
    // Sweep 0 walks counter-clockwise on screen, matching increasing angle.
    svg: () => `<path d="M${n(ox0)} ${n(oy0)} A${n(rOut)} ${n(rOut)} 0 ${large} 0 ${n(ox1)} ${n(oy1)} ` +
               `L${n(ix1)} ${n(iy1)} A${n(rIn)} ${n(rIn)} 0 ${large} 1 ${n(ix0)} ${n(iy0)} Z" fill="${fill}"/>`,
  };
}

const n = v => +v.toFixed(2);

// ── The mark ─────────────────────────────────────────────────────────────────
// `scheme` picks the two-tone treatment:
//   'dark'  — for green/onyx grounds: ivory ring and ball, green architecture.
//   'light' — for ivory grounds: green ring and architecture, ball reads only
//             through its dimples (matching the embossed/paper lockup).
export function markShapes(scheme = 'dark') {
  const ring = scheme === 'dark' ? BRAND.ivory : BRAND.green;
  const ball = BRAND.ivory;   // on an ivory ground it reads only via dimples
  const ink  = BRAND.green;   // architecture + dimples
  const flag = BRAND.gold;
  const s = [];

  // 1. Golf ball first — the ring overlaps nothing, but the ball must sit
  //    behind every piece of architecture drawn on top of it.
  s.push(disc(CX, CY, BALL_R, ball));

  // 2. Dimples. A hex lattice clipped to the upper-left crescent and growing
  //    toward the rim, so the sphere reads as curved rather than flat. Drawn
  //    before the architecture, which simply covers the ones it overlaps.
  const step = 3.6;
  for (let row = 0; row * step < BALL_R * 2; row++) {
    for (let col = 0; col * step < BALL_R * 2; col++) {
      const x = CX - BALL_R + col * step + (row % 2 ? step / 2 : 0);
      const y = CY - BALL_R + row * step;
      const dx = x - CX, dy = y - CY;
      const d = Math.hypot(dx, dy) / BALL_R;
      if (d < 0.20 || d > 0.94) continue;
      // Projection onto the up-and-left diagonal keeps the lattice on the
      // lit shoulder of the ball and off the portico.
      if ((-dx - dy) / Math.SQRT2 < 0.10 * BALL_R) continue;
      s.push(disc(x, y, 0.52 + 0.72 * d, ink));
    }
  }

  // 3. The pin. Pole is drawn before the roof so the roof buries its foot.
  s.push(rect(59.6, 20.5, 1.6, 30, flag));
  s.push(poly([[61.2, 21.2], [71.6, 25.4], [61.2, 29.8]], flag));

  // 4. The portico: roof, entablature, six columns flanking a paned window.
  s.push(poly([[50, 41.5], [74, 55], [26, 55]], ink));   // roof
  s.push(rect(28.5, 55, 43, 3.6, ink));                  // entablature
  const TOP = 58.6, BOT = 71;
  for (const x0 of [30, 35.4, 40.8, 56, 61.4, 66.8]) s.push(rect(x0, TOP, 3.2, BOT - TOP, ink));
  // Central window: light pane grid, mullions in the architecture colour.
  s.push(rect(44, TOP, 12, BOT - TOP, ball));
  s.push(rect(49.4, TOP, 1.2, BOT - TOP, ink));
  for (const y0 of [62.6, 66.8]) s.push(rect(44, y0, 12, 1.2, ink));
  s.push(rect(30, BOT, 40, 2.4, ink));                   // stylobate

  // 5. The ring, last: it sits outside the ball so order is cosmetic, but
  //    drawing it last keeps the silhouette crisp against the flag.
  s.push(ringSector(CX, CY, R_OUT, R_IN, GAP, 360 - GAP, ring));
  return s;
}

// ── Renderer A: SVG ──────────────────────────────────────────────────────────
// `bg` may be null for a transparent mark (in-app logo), or a colour with an
// optional corner radius (app icon).
export function toSVG({ scheme = 'dark', bg = null, radius = 0, size = 512, pad = 0, title = 'Clubhouse Golf' } = {}) {
  const inner = 100 - pad * 2;
  const body = markShapes(scheme)
    .map(sh => `    ${sh.svg()}`)
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${title}">
  <title>${title}</title>
${bg ? `  <rect width="100" height="100"${radius ? ` rx="${n(radius)}"` : ''} fill="${bg}"/>\n` : ''}  <g transform="translate(${n(pad)} ${n(pad)}) scale(${n(inner / 100)})">
${body}
  </g>
</svg>
`;
}

// ── Renderer B: point sampler for the rasteriser ─────────────────────────────
// Returns an [r,g,b] for a point in the 100x100 box, or null where the mark is
// transparent. Shapes are walked back-to-front so the last hit wins.
export function sampler(scheme = 'dark') {
  const shapes = markShapes(scheme).map(sh => ({ ...sh, rgb: hex(sh.fill) }));
  return (x, y) => {
    let out = null;
    for (const sh of shapes) {
      const b = sh.bbox;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (sh.hit(x, y)) out = sh.rgb;
    }
    return out;
  };
}

export const RGB = hex;
