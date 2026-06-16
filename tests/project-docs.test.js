const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
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

  test('has a Docs nav button with data-tab="docs"', () => {
    const btn = document.querySelector('[data-tab="docs"]');
    expect(btn).not.toBeNull();
    expect(btn.tagName).toBe('BUTTON');
  });

  test('#tab-docs comes after #tab-swing in document order', () => {
    const swing = document.getElementById('tab-swing');
    const docs  = document.getElementById('tab-docs');
    const { JSDOM: JSDOMClass } = require('jsdom');
    const win = new JSDOMClass(INDEX_HTML).window;
    const Node = win.Node;
    expect(swing).not.toBeNull();
    expect(docs).not.toBeNull();
    expect(swing.compareDocumentPosition(docs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  test('doc cards navigate in the same window (no target=_blank in renderDocs)', () => {
    const renderDocsBlock = APP_JS.slice(
      APP_JS.indexOf('function renderDocs'),
      APP_JS.indexOf('// ─', APP_JS.indexOf('function renderDocs') + 1)
    );
    expect(renderDocsBlock).not.toMatch(/target\s*=\s*["']_blank["']/);
  });
});

describe('Docs tab — linked files exist', () => {
  const EXPECTED_FILES = [
    'GolfVault_OrderProcessing_Workflow.html',
    'GolfVault_CustomVsShopify_Comparison.html',
  ];

  EXPECTED_FILES.forEach(file => {
    test(`${file} exists in docs/`, () => {
      expect(fs.existsSync(path.join(DOCS_DIR, file))).toBe(true);
    });
  });
});

describe('Docs tab — styles', () => {
  test('defines .docs-tab-list and .doc-card rules', () => {
    expect(STYLES_CSS).toMatch(/\.docs-tab-list\s*\{/);
    expect(STYLES_CSS).toMatch(/\.doc-card\s*\{/);
  });
});
