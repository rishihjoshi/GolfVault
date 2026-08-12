const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT       = path.join(__dirname, '..');
const DOCS_DIR   = path.join(ROOT, 'docs');
const INDEX_HTML = fs.readFileSync(path.join(DOCS_DIR, 'index.html'), 'utf8');
const APP_JS     = fs.readFileSync(path.join(DOCS_DIR, 'app.js'), 'utf8');
const STYLES_CSS = fs.readFileSync(path.join(DOCS_DIR, 'styles.css'), 'utf8');
const MANIFEST   = JSON.parse(fs.readFileSync(path.join(DOCS_DIR, 'manifest.json'), 'utf8'));
const VERSION    = JSON.parse(fs.readFileSync(path.join(DOCS_DIR, 'version.json'), 'utf8'));

const TABS = APP_JS.match(/const TABS\s*=\s*\[([^\]]+)\]/)[1]
  .split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);

const document = new JSDOM(INDEX_HTML).window.document;

describe('Tab wiring stays in sync', () => {
  // A tab lives in four places. Drift between them is the failure mode this
  // whole suite exists to catch.
  test('every TABS entry has a renderTab case', () => {
    TABS.forEach(tab => {
      expect(APP_JS).toMatch(new RegExp(`case\\s+'${tab}'\\s*:`));
    });
  });

  test('every TABS entry has a #tab-<id> panel', () => {
    TABS.forEach(tab => {
      expect(document.getElementById(`tab-${tab}`)).not.toBeNull();
    });
  });

  test('every nav button targets a real tab', () => {
    const navTabs = [...document.querySelectorAll('#bottom-nav [data-tab]')]
      .map(b => b.dataset.tab);
    expect(navTabs.length).toBeGreaterThan(0);
    navTabs.forEach(t => expect(TABS).toContain(t));
  });

  test('nav grid column count matches the number of nav buttons', () => {
    const navTabs = document.querySelectorAll('#bottom-nav [data-tab]').length;
    const cols = STYLES_CSS.match(/#bottom-nav\s*\{[^}]*grid-template-columns:\s*repeat\((\d+)/s);
    expect(cols).not.toBeNull();
    expect(Number(cols[1])).toBe(navTabs);
  });

  test('manifest shortcuts point at real tabs', () => {
    (MANIFEST.shortcuts || []).forEach(sc => {
      const hash = sc.url.split('#')[1];
      if (hash) expect(TABS).toContain(hash);
    });
  });
});

describe('Brand alignment', () => {
  test('brand pillars use the site vocabulary', () => {
    ['Marketplace', 'Caddy AI', 'Performance', 'Competition',
     'Experiences', 'Community', 'Technology', 'Memberships']
      .forEach(p => expect(APP_JS).toContain(p));
  });

  test('the assistant is called Caddy AI, not Golf AI Assistant', () => {
    expect(APP_JS).not.toContain('Golf AI Assistant');
    expect(INDEX_HTML).not.toContain('Golf AI Assistant');
  });

  test('Performance exposes its four sub-views', () => {
    ['swing', 'lessons', 'coaching', 'stats']
      .forEach(sub => expect(APP_JS).toMatch(new RegExp(`id:\\s*'${sub}'`)));
  });

  test('the Founding Member CTA is a real outbound link', () => {
    expect(APP_JS).toMatch(/JOIN_URL\s*=\s*'https:\/\/chgolfco\.com\//);
    expect(APP_JS).toMatch(/rel="noopener"/);
  });

  test('never claims the user completed signup', () => {
    expect(APP_JS).not.toMatch(/You'?re a Founding Member/i);
  });
});

describe('Deploy hygiene', () => {
  // The self-update check compares the baked-in constant against live JSON.
  // Drift means the update prompt either never fires or fires forever.
  test('APP_VERSION matches version.json', () => {
    const appVersion = APP_JS.match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
    expect(appVersion).toBe(VERSION.version);
  });

  test('components the pillar cards depend on still exist', () => {
    ['.status-badge', '.doc-card', '.story-block', '.roadmap', '.perf-body']
      .forEach(sel => expect(STYLES_CSS).toContain(sel));
  });
});
