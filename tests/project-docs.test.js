const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const INDEX_HTML = fs.readFileSync(path.join(DOCS_DIR, 'index.html'), 'utf8');
const STYLES_CSS = fs.readFileSync(path.join(DOCS_DIR, 'styles.css'), 'utf8');

describe('Project Docs panel', () => {
  let document;
  let Node;

  beforeAll(() => {
    const dom = new JSDOM(INDEX_HTML);
    document = dom.window.document;
    Node = dom.window.Node;
  });

  test('renders #project-docs aside with a title', () => {
    const panel = document.getElementById('project-docs');
    expect(panel).not.toBeNull();
    expect(panel.tagName).toBe('ASIDE');
    expect(panel.querySelector('.docs-panel-title')).not.toBeNull();
  });

  test('contains exactly two doc links that open in a new tab safely', () => {
    const links = document.querySelectorAll('#project-docs a.docs-link');
    expect(links).toHaveLength(2);
    links.forEach(link => {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener');
      expect(link.getAttribute('href')).toBeTruthy();
    });
  });

  test('linked workflow and comparison docs exist as files in docs/', () => {
    const links = document.querySelectorAll('#project-docs a.docs-link');
    links.forEach(link => {
      const href = link.getAttribute('href');
      const filePath = path.join(DOCS_DIR, href);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  test('#project-docs is placed inside <body>, after the #app shell', () => {
    const app = document.getElementById('app');
    const panel = document.getElementById('project-docs');
    expect(app).not.toBeNull();
    expect(panel).not.toBeNull();
    // panel should come after #app in document order
    expect(app.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Project Docs panel styles', () => {
  test('defines base, mobile-stacked, and desktop-sidebar styles', () => {
    expect(STYLES_CSS).toMatch(/#project-docs\s*\{/);
    expect(STYLES_CSS).toMatch(/\.docs-link\s*\{/);
    expect(STYLES_CSS).toMatch(/@media \(min-width: 901px\)/);
  });
});
