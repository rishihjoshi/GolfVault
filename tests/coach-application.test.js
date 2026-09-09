const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const read = f => fs.readFileSync(f, 'utf8').split('\r\n').join('\n');

const HTML = read(path.join(DOCS, 'coach-application.html'));
const CSS = read(path.join(DOCS, 'coach-application.css'));
const JS = read(path.join(DOCS, 'coach-application.js'));
const APP_JS = read(path.join(DOCS, 'app.js'));
const SW = read(path.join(DOCS, 'sw.js'));

let document;
beforeAll(() => { document = new JSDOM(HTML).window.document; });

describe('Coach application — page wiring', () => {
  test('the three files ship and are precached', () => {
    ['coach-application.html', 'coach-application.css', 'coach-application.js']
      .forEach(f => {
        expect(fs.existsSync(path.join(DOCS, f))).toBe(true);
        expect(SW).toContain('./' + f);
      });
  });

  test('the app links to it from the Coaching sub-tab', () => {
    expect(APP_JS).toContain('href="coach-application.html"');
    expect(APP_JS).toContain('Want to become a Clubhouse Coach?');
    expect(APP_JS).toContain('Apply to Coach');
  });

  // It is an application to join the network, not a route into the
  // profession. The copy must not imply Clubhouse trains people from scratch.
  test('the CTA does not promise to make someone a golf coach', () => {
    expect(APP_JS).not.toMatch(/become a (golf|professional) coach/i);
  });

  test('an application form is not indexed', () => {
    expect(document.querySelector('meta[name="robots"]').content).toContain('noindex');
  });
});

describe('Coach application — all nine sections', () => {
  const EXPECTED = [
    'Basic Info', 'Background', 'What You Offer', 'How You Work',
    'Golfer Fit', 'Availability', 'Content', 'Partnership', 'Verification',
  ];

  test('every section is present and in order', () => {
    const titles = [...document.querySelectorAll('.ca-section')].map(s => s.dataset.title);
    expect(titles).toEqual(EXPECTED);
  });

  test.each([
    ['role', 9], ['services', 18], ['formats', 5], ['worksWith', 10],
    ['solves', 11], ['contentInterests', 11], ['partnershipGoals', 10], ['benefitType', 5],
  ])('the %s group offers all %i options', (name, count) => {
    expect(document.querySelectorAll(`[name="${name}"]`)).toHaveLength(count);
  });

  test.each([
    ['delivery', 3], ['priceRange', 5], ['acceptingClients', 2],
    ['onlineBooking', 2], ['memberBenefit', 3],
  ])('the %s choice offers %i mutually exclusive options', (name, count) => {
    const nodes = document.querySelectorAll(`[name="${name}"]`);
    expect(nodes).toHaveLength(count);
    nodes.forEach(n => expect(n.type).toBe('radio'));
  });

  test('verification collects the credentials and consents asked for', () => {
    ['certUpload', 'insuranceUpload', 'pgaNumber', 'businessLicense', 'references',
      'backgroundCheckConsent', 'agreeStandards', 'agreeTerms']
      .forEach(n => expect(document.querySelector(`[name="${n}"]`)).not.toBeNull());
  });
});

describe('Coach application — accessibility', () => {
  test('every control has an accessible name', () => {
    const orphans = [...document.querySelectorAll('input, select, textarea')].filter(el => {
      const byFor = el.id && document.querySelector(`label[for="${el.id}"]`);
      return !byFor && !el.closest('label') && !el.getAttribute('aria-label');
    });
    expect(orphans.map(el => el.name || el.id)).toEqual([]);
  });

  test('every choice group is a fieldset with a legend', () => {
    const sets = [...document.querySelectorAll('fieldset')];
    expect(sets.length).toBeGreaterThan(0);
    sets.forEach(fs2 => expect(fs2.querySelector('legend')).not.toBeNull());
  });

  test('exactly one h1', () => {
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });

  test('only the two agreements and core identity are required', () => {
    const required = [...document.querySelectorAll('[required]')].map(el => el.name).sort();
    expect(required).toEqual(['agreeStandards', 'agreeTerms', 'city', 'email', 'fullName', 'state']);
  });

  // Consent to a background check must be a deliberate opt-in, never pre-ticked.
  test('background check consent is optional and unchecked', () => {
    const el = document.querySelector('[name="backgroundCheckConsent"]');
    expect(el.hasAttribute('required')).toBe(false);
    expect(el.hasAttribute('checked')).toBe(false);
  });
});

describe('Coach application — styling guards', () => {
  // Regression: .ca-done and .ca-field set `display`, which outranks the
  // user-agent's [hidden] { display: none }. Without this rule the success
  // panel and every conditional field render permanently on screen.
  test('the hidden attribute outranks the display rules', () => {
    expect(CSS).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });

  // Regression: styles.css is loaded for its tokens but its unscoped body rule
  // (display:flex at >=481px) laid the masthead and form out side by side.
  test('the app-shell body layout is neutralised', () => {
    const body = CSS.slice(CSS.indexOf('.ca-body {'), CSS.indexOf('}', CSS.indexOf('.ca-body {')));
    expect(body).toMatch(/display:\s*block/);
    expect(body).toMatch(/overflow:\s*visible/);
  });

  test('the page still loads styles.css, so the palette stays single-sourced', () => {
    expect(HTML).toContain('href="styles.css"');
    expect(CSS).not.toMatch(/--ch-green:\s*#/);
  });
});

describe('Coach application — submission honesty', () => {
  // With no backend configured the form must not claim an application was
  // received. This is the guard on that.
  test('no endpoint is configured by default', () => {
    expect(JS).toMatch(/SUBMIT_ENDPOINT = ''/);
  });

  test('the heading only claims receipt when something was transmitted', () => {
    const fn = JS.slice(JS.indexOf('function finish('), JS.indexOf('\n  }', JS.indexOf('function finish(')));
    expect(fn).toContain("heading.textContent = 'Application received'");
    expect(fn).toContain("heading.textContent = 'Application downloaded'");
    // The received wording must sit on the transmitted branch, before the else.
    expect(fn.indexOf("'Application received'")).toBeLessThan(fn.indexOf('} else {'));
    expect(fn.indexOf("'Application downloaded'")).toBeGreaterThan(fn.indexOf('} else {'));
  });

  test('the fallback says plainly that Clubhouse has not received it', () => {
    expect(JS).toMatch(/has not reached\s*'?\s*\+?\s*'?\s*Clubhouse yet/);
  });
});

describe('Coach application — data handling', () => {
  test('the draft uses the established gv_ key prefix', () => {
    expect(JS).toMatch(/DRAFT_KEY = 'gv_coach_draft'/);
  });

  test('uploaded files are kept out of the draft', () => {
    const save = JS.slice(JS.indexOf('function saveDraft'), JS.indexOf('function restoreDraft'));
    expect(save).toContain('collect(false)');
  });

  test('a restored draft is validated rather than trusted', () => {
    const start = JS.indexOf('function restoreDraft');
    const restore = JS.slice(start, JS.indexOf('form.addEventListener', start));
    expect(restore).toContain('try { parsed = JSON.parse(raw); }');
    expect(restore).toMatch(/typeof parsed === 'object'/);
    expect(restore).toMatch(/if \(!nodes\.length\) return;/);
  });

  test('uploads are size-capped', () => {
    expect(JS).toMatch(/MAX_FILE_BYTES = \d+ \* 1024 \* 1024/);
    expect(JS).toMatch(/MAX_TOTAL_BYTES = \d+ \* 1024 \* 1024/);
  });

  test('no user-supplied value is written through innerHTML', () => {
    const assignments = JS.split('\n').filter(l => /innerHTML\s*=/.test(l));
    expect(assignments.length).toBeGreaterThan(0);
    assignments.forEach(line => {
      const rhs = line.slice(line.indexOf('innerHTML') + 'innerHTML'.length).replace(/^\s*=\s*/, '');
      // Only an empty string or the static rail markup is permitted.
      expect(rhs).toMatch(/^(''|'<b>' \+ \(i \+ 1\))/);
    });
  });

  test('the only outbound request is the configured endpoint', () => {
    const calls = JS.match(/fetch\([^)]*/g) || [];
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('SUBMIT_ENDPOINT');
  });
});
