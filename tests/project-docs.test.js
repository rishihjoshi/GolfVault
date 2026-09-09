const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const ARCHIVE_DIR = path.join(__dirname, '..', 'docs-archive');
const INDEX_HTML = fs.readFileSync(path.join(DOCS_DIR, 'index.html'), 'utf8');
const APP_JS    = fs.readFileSync(path.join(DOCS_DIR, 'app.js'), 'utf8');
const STYLES_CSS = fs.readFileSync(path.join(DOCS_DIR, 'styles.css'), 'utf8');

describe('Docs tab — HTML shell', () => {
  let document;

  beforeAll(() => {
    const dom = new JSDOM(INDEX_HTML);
    document = dom.window.document;
  });

  test('has a #tab-docs section as a tab-panel', () => {
    const panel = document.getElementById('tab-docs');
    expect(panel).not.toBeNull();
    expect(panel.classList.contains('tab-panel')).toBe(true);
  });

  // Docs is hidden from the nav but still reachable at #docs. The panel and
  // renderer stay so it can be restored by re-adding one button.
  test('has NO Docs nav button — hidden from customers', () => {
    expect(document.querySelector('[data-tab="docs"]')).toBeNull();
  });

  test('#tab-docs is the last tab-panel in document order', () => {
    const panels = [...document.querySelectorAll('.tab-panel')];
    expect(panels.length).toBeGreaterThan(0);
    expect(panels[panels.length - 1].id).toBe('tab-docs');
  });
});

describe('Docs tab — app.js behaviour', () => {
  test("TABS array includes 'docs'", () => {
    expect(APP_JS).toMatch(/const TABS\s*=\s*\[.*'docs'.*\]/s);
  });

  test("renderTab switch has a 'docs' case", () => {
    expect(APP_JS).toMatch(/case\s+'docs'\s*:/);
  });

  test('renderDocs function is defined', () => {
    expect(APP_JS).toMatch(/function renderDocs\s*\(\)/);
  });

  test('renderDocs links nothing — the reference pages are archived', () => {
    const renderDocsBlock = APP_JS.slice(
      APP_JS.indexOf('function renderDocs'),
      APP_JS.indexOf('// ─', APP_JS.indexOf('function renderDocs') + 1)
    );
    expect(renderDocsBlock).not.toMatch(/target\s*=\s*["']_blank["']/);
    expect(renderDocsBlock).not.toMatch(/href=/);
  });
});

// The two internal reference pages were archived out of the published app.
// docs-archive/ is not served by GitHub Pages, so a copy left behind in docs/
// would be a stale duplicate and a link back into it would 404.
describe('Project docs — archived, not published', () => {
  const ARCHIVED_FILES = [
    'clubhouse-golf-order-processing-workflow.html',
    'clubhouse-golf-custom-vs-shopify-comparison.html',
  ];

  ARCHIVED_FILES.forEach(file => {
    test(`${file} lives in docs-archive/, not docs/`, () => {
      expect(fs.existsSync(path.join(ARCHIVE_DIR, file))).toBe(true);
      expect(fs.existsSync(path.join(DOCS_DIR, file))).toBe(false);
    });

    test(`nothing in docs/ links to ${file}`, () => {
      expect(APP_JS).not.toContain(file);
      expect(INDEX_HTML).not.toContain(file);
    });
  });

  // The point is that the archived pages are not left behind as stale
  // duplicates — not that docs/ may only ever hold one page. New pages (the
  // coach application, for one) are fine; resurrected archived ones are not.
  test('no archived page is republished from docs/', () => {
    const html = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.html'));
    ARCHIVED_FILES.forEach(f => expect(html).not.toContain(f));
    expect(html).toContain('index.html');
  });
});

describe('Docs tab — styles', () => {
  test('defines .docs-tab-list and .doc-card rules', () => {
    expect(STYLES_CSS).toMatch(/\.docs-tab-list\s*\{/);
    expect(STYLES_CSS).toMatch(/\.doc-card\s*\{/);
  });
});
