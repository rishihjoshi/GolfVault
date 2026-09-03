const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
// Normalise line endings. The working tree is CRLF on Windows, and the
// source extraction below anchors on a closing brace at the start of a line.
const read = f => fs.readFileSync(f, 'utf8').split('\r\n').join('\n');
const APP_JS = read(path.join(DOCS, 'app.js'));
const INDEX_HTML = read(path.join(DOCS, 'index.html'));
const DRIVERS = JSON.parse(fs.readFileSync(path.join(DOCS, 'data', 'drivers.json'), 'utf8'));

describe('Home tab (renamed from Vision)', () => {
  let document;
  beforeAll(() => { document = new JSDOM(INDEX_HTML).window.document; });

  test('the first tab is Home, not Vision', () => {
    expect(APP_JS).toMatch(/const TABS = \['home'/);
    expect(APP_JS).toMatch(/const DEFAULT_TAB = 'home'/);
    expect(document.getElementById('tab-home')).not.toBeNull();
    expect(document.getElementById('tab-vision')).toBeNull();
    expect(document.querySelector('[data-tab="home"]')).not.toBeNull();
  });

  // Installed PWA shortcuts and old bookmarks still point at #vision.
  test('#vision still resolves, so old links keep working', () => {
    expect(APP_JS).toMatch(/vision:\s*'home'/);
  });

  test('renderHome exists and is routed', () => {
    expect(APP_JS).toMatch(/function renderHome\s*\(\)/);
    expect(APP_JS).toMatch(/case\s+'home'\s*:/);
    expect(APP_JS).not.toContain('renderVision');
  });

  test('the hero uses the supplied artwork', () => {
    expect(APP_JS).toContain('assets/clubhouse-hero.jpg');
    expect(fs.existsSync(path.join(DOCS, 'assets', 'clubhouse-hero.jpg'))).toBe(true);
  });
});

describe('Brand language follows the GTM playbook', () => {
  test('leads with the primary brand line', () => {
    expect(APP_JS).toMatch(/Everything Golf\.<br>One Clubhouse\./);
    expect(INDEX_HTML).toContain('Everything Golf. One Clubhouse.');
  });

  test('the retired positioning line is gone', () => {
    expect(INDEX_HTML).not.toContain('Your Complete Golf Companion');
  });

  test('CTAs are intent-specific, not generic', () => {
    expect(APP_JS).toContain('Find Your Fit');
  });
});

describe('Find Your Fit — data', () => {
  test('ships ten drivers with unique ids and ranks 1..10', () => {
    expect(DRIVERS).toHaveLength(10);
    expect(new Set(DRIVERS.map(d => d.id)).size).toBe(10);
    expect(DRIVERS.map(d => d.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('every driver carries a complete, coherent fit block', () => {
    for (const d of DRIVERS) {
      expect(typeof d.name).toBe('string');
      expect(typeof d.price).toBe('number');
      const f = d.fit;
      expect(f.handicapMin).toBeLessThan(f.handicapMax);
      expect(f.speedMin).toBeLessThan(f.speedMax);
      expect(['high', 'mid', 'low']).toContain(f.launch);
      expect(['high', 'mid', 'low']).toContain(f.spin);
      expect(['draw', 'neutral', 'fade']).toContain(f.bias);
      expect(f.forgiveness).toBeGreaterThanOrEqual(1);
      expect(f.forgiveness).toBeLessThanOrEqual(5);
      expect(f.workability).toBeGreaterThanOrEqual(1);
      expect(f.workability).toBeLessThanOrEqual(5);
    }
  });

  test('the whole handicap range is covered by at least one driver', () => {
    for (let hc = 0; hc <= 36; hc++) {
      const covered = DRIVERS.some(d => hc >= d.fit.handicapMin && hc <= d.fit.handicapMax);
      expect(covered).toBe(true);
    }
  });

  test('any driver referencing the catalogue points at a real product', () => {
    const products = JSON.parse(fs.readFileSync(path.join(DOCS, 'data', 'products.json'), 'utf8'));
    const ids = new Set(products.map(p => p.id));
    DRIVERS.filter(d => d.productId).forEach(d => expect(ids.has(d.productId)).toBe(true));
  });
});

describe('Find Your Fit — wiring', () => {
  test('drivers.json is loaded and precached', () => {
    expect(APP_JS).toContain('drivers.json');
    expect(read(path.join(DOCS, 'sw.js'))).toContain('./data/drivers.json');
  });

  test('the profile persists under the gv_ key prefix', () => {
    expect(APP_JS).toContain('gv_player_profile');
  });

  test('the scorer and the Stats view are defined and wired', () => {
    ['function scoreDriver', 'function shaftFlex', 'function perfStatsHtml',
      'function wireStatsEvents', 'function curatedTeaserHtml']
      .forEach(fn => expect(APP_JS).toContain(fn));
    expect(APP_JS).toMatch(/perfStatsHtml\(\);\s*wireStatsEvents\(body\)/);
  });

  test('recommendations are labelled as guidance, not a fitting', () => {
    expect(APP_JS).toMatch(/not a replacement for being fitted/i);
  });
});

describe('Find Your Fit — scoring behaviour', () => {
  // Evaluate the shipped source rather than a copy, so this fails if the real
  // scoring changes. These are plain functions over their arguments.
  const ctx = {};
  beforeAll(() => {
    const fnSrc = name => {
      const i = APP_JS.indexOf(name);
      return APP_JS.slice(i, APP_JS.indexOf('\n}\n', i) + 2);
    };
    const src = [
      APP_JS.slice(APP_JS.indexOf('const MISS_TYPES'), APP_JS.indexOf('const hcBand')),
      'const hcBand = hc => HC_BANDS.find(b => hc <= b.max);',
      'const cap = s => s.charAt(0).toUpperCase() + s.slice(1);',
      fnSrc('function shaftFlex'),
      fnSrc('function scoreDriver'),
      fnSrc('function normalisePlayerProfile'),
      'exports.scoreDriver = scoreDriver; exports.shaftFlex = shaftFlex;',
      'exports.normalisePlayerProfile = normalisePlayerProfile;',
    ].join('\n');
    // vm, not new Function: this evaluates first-party source read off disk to
    // test the shipped scoring rather than a copy of it, and vm is the
    // idiomatic Node way to do that with an explicit sandbox.
    vm.runInNewContext(src, { exports: ctx });
  });

  const rank = prof => DRIVERS
    .map(d => ({ d, ...ctx.scoreDriver(d, prof) }))
    .sort((a, b) => b.score - a.score);

  test('shaft flex rises with clubhead speed', () => {
    expect(ctx.shaftFlex(70)).toMatch(/Senior/);
    expect(ctx.shaftFlex(80)).toMatch(/Regular/);
    expect(ctx.shaftFlex(100)).toMatch(/Stiff/);
    expect(ctx.shaftFlex(112)).toMatch(/Extra Stiff/);
  });

  test('a high handicapper who slices gets a forgiving draw-bias head', () => {
    const ranked = rank({ handicap: 24, swingSpeed: 78, driverCarry: 190, miss: 'slice', budget: 500 });
    expect(ranked[0].d.fit.bias).toBe('draw');
    expect(ranked[0].d.fit.forgiveness).toBeGreaterThanOrEqual(4);
    // The tour blade should be nowhere near the top for this golfer.
    expect(ranked.findIndex(r => r.d.id === 'd03')).toBeGreaterThan(5);
  });

  test('a scratch player at speed gets a workable low-spin head', () => {
    const ranked = rank({ handicap: 2, swingSpeed: 108, driverCarry: 290, miss: 'straight', budget: 700 });
    expect(ranked[0].d.fit.spin).toBe('low');
    expect(ranked[0].d.fit.workability).toBeGreaterThanOrEqual(4);
  });

  test('scores stay within 0-100 across the whole input space', () => {
    for (const hc of [0, 5, 15, 28, 54]) {
      for (const sp of [40, 70, 95, 140]) {
        for (const miss of ['slice', 'straight', 'hook']) {
          for (const budget of [0, 250, 5000]) {
            for (const d of DRIVERS) {
              const { score } = ctx.scoreDriver(d, { handicap: hc, swingSpeed: sp, driverCarry: 200, miss, budget });
              expect(score).toBeGreaterThanOrEqual(0);
              expect(score).toBeLessThanOrEqual(100);
            }
          }
        }
      }
    }
  });

  test('being over budget always costs a driver score', () => {
    const d = DRIVERS.find(x => x.price > 500);
    const base = { handicap: 10, swingSpeed: 100, driverCarry: 260, miss: 'straight' };
    expect(ctx.scoreDriver(d, { ...base, budget: 200 }).score)
      .toBeLessThan(ctx.scoreDriver(d, { ...base, budget: 5000 }).score);
  });

  test('every scored driver explains itself', () => {
    const prof = { handicap: 18, swingSpeed: 88, driverCarry: 215, miss: 'slice', budget: 400 };
    for (const d of DRIVERS) {
      const { reasons } = ctx.scoreDriver(d, prof);
      expect(reasons.length).toBeGreaterThan(0);
      expect(reasons.length).toBeLessThanOrEqual(3);
    }
  });

  // The profile is restored from localStorage, so it can be an older schema, a
  // hand-edited value or a half-written object. It must never reach the scorer
  // unvalidated: a missing handicap used to make hcBand() return undefined and
  // throw, taking the whole Stats tab down.
  describe('malformed stored profiles are normalised, never trusted', () => {
    const MALFORMED = [
      ['an empty object', {}],
      ['a handicap as a string', { handicap: '24', swingSpeed: 78, miss: 'slice', budget: 500 }],
      ['a negative handicap', { handicap: -5, swingSpeed: 90, miss: 'straight', budget: 500 }],
      ['an absurd handicap', { handicap: 9999, swingSpeed: 90, miss: 'straight', budget: 500 }],
      ['a NaN speed', { handicap: 10, swingSpeed: NaN, miss: 'hook', budget: 100 }],
      ['a missing miss', { handicap: 12, swingSpeed: 90, budget: 500 }],
    ];

    test.each(MALFORMED)('%s scores without throwing', (_label, raw) => {
      const prof = ctx.normalisePlayerProfile(raw);
      for (const d of DRIVERS) {
        expect(() => ctx.scoreDriver(d, prof)).not.toThrow();
      }
    });

    test.each(MALFORMED)('%s is coerced into range', (_label, raw) => {
      const p = ctx.normalisePlayerProfile(raw);
      expect(p.handicap).toBeGreaterThanOrEqual(0);
      expect(p.handicap).toBeLessThanOrEqual(54);
      expect(p.swingSpeed).toBeGreaterThanOrEqual(40);
      expect(p.swingSpeed).toBeLessThanOrEqual(140);
      expect(Number.isFinite(p.driverCarry)).toBe(true);
      expect(Number.isFinite(p.budget)).toBe(true);
      expect(['slice', 'straight', 'hook']).toContain(p.miss);
    });

    test('a non-object stored value yields no profile at all', () => {
      expect(ctx.normalisePlayerProfile(null)).toBeNull();
      expect(ctx.normalisePlayerProfile('garbage')).toBeNull();
      expect(ctx.normalisePlayerProfile(undefined)).toBeNull();
    });

    // miss is the only stored field that is a string, so it is the only one
    // that could carry markup into the DOM.
    test('an injected miss value is rejected to the enum', () => {
      const p = ctx.normalisePlayerProfile({ handicap: 10, swingSpeed: 90, budget: 100, miss: '"><img src=x onerror=alert(1)>' });
      expect(p.miss).toBe('straight');
    });
  });

  test('the same numbers always produce the same order', () => {
    const prof = { handicap: 12, swingSpeed: 96, driverCarry: 245, miss: 'hook', budget: 600 };
    expect(rank(prof).map(r => r.d.id)).toEqual(rank(prof).map(r => r.d.id));
  });
});
