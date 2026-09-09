/* ============================================================
   Coach Application — Clubhouse Golf
   No framework, no build step, consistent with the rest of docs/.
   ============================================================ */
(function () {
  'use strict';

  // ── Configuration ──────────────────────────────────────────
  // GitHub Pages is static, so there is no server here to receive a POST.
  // Set SUBMIT_ENDPOINT to a URL that accepts a JSON POST (a form backend, a
  // serverless function, whatever the business ends up using) and the form
  // transmits directly. Until then it will NOT claim to have submitted
  // anything: it hands the applicant their completed application as a file and
  // says plainly that Clubhouse has not received it yet.
  let SUBMIT_ENDPOINT = '';
  let CONTACT_EMAIL = '';          // shown in the fallback instructions if set

  let DRAFT_KEY = 'gv_coach_draft';
  let MAX_FILE_BYTES = 5 * 1024 * 1024;      // per file
  let MAX_TOTAL_BYTES = 15 * 1024 * 1024;    // all files combined

  let form = document.getElementById('coach-form');
  if (!form) return;

  let sections = Array.prototype.slice.call(form.querySelectorAll('.ca-section'));

  // ── Progress rail ──────────────────────────────────────────
  let railList = document.getElementById('ca-rail-list');
  sections.forEach(function (sec, i) {
    let li = document.createElement('li');
    li.dataset.target = sec.id;
    li.innerHTML = '<b>' + (i + 1) + '</b><span></span>';
    li.querySelector('span').textContent = sec.dataset.title;
    railList.appendChild(li);
  });
  let railItems = Array.prototype.slice.call(railList.children);

  if ('IntersectionObserver' in window) {
    let spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        let idx = sections.indexOf(e.target);
        railItems.forEach(function (li, i) {
          li.classList.toggle('active', i === idx);
          li.classList.toggle('done', i < idx);
        });
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    sections.forEach(function (s) { spy.observe(s); });
  }

  // ── Conditional "Other" reveals ────────────────────────────
  // A control tagged data-other="<id>" shows that block while it is checked.
  // Radios also need their siblings watched, since unchecking is implicit.
  function syncConditionals() {
    form.querySelectorAll('[data-other]').forEach(function (label) {
      let input = label.querySelector('input');
      let target = document.getElementById(label.dataset.other);
      if (input && target) target.hidden = !input.checked;
    });
  }
  form.addEventListener('change', function (e) {
    if (e.target.type === 'checkbox' || e.target.type === 'radio') syncConditionals();
  });

  // ── Character counter ──────────────────────────────────────
  form.querySelectorAll('[data-counter]').forEach(function (el) {
    let out = form.querySelector('.ca-count[data-for="' + el.id + '"]');
    if (!out) return;
    let update = function () { out.textContent = String(el.value.length); };
    el.addEventListener('input', update);
    update();
  });

  // ── File previews and size guards ──────────────────────────
  let fileInputs = Array.prototype.slice.call(form.querySelectorAll('input[type="file"]'));
  fileInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      clearFieldError(input);
      let preview = input.dataset.preview ? document.getElementById(input.dataset.preview) : null;
      if (preview) preview.innerHTML = '';

      Array.prototype.forEach.call(input.files, function (file) {
        if (file.size > MAX_FILE_BYTES) {
          setFieldError(input, file.name + ' is ' + mb(file.size) + ' — the limit is ' + mb(MAX_FILE_BYTES) + '.');
          input.value = '';
          return;
        }
        if (preview && /^image\//.test(file.type)) {
          let img = document.createElement('img');
          img.alt = '';
          img.src = URL.createObjectURL(file);
          img.onload = function () { URL.revokeObjectURL(img.src); };
          preview.appendChild(img);
        }
      });
    });
  });

  function mb(bytes) { return (bytes / 1024 / 1024).toFixed(1) + ' MB'; }

  // ── Draft autosave ─────────────────────────────────────────
  // Files are deliberately excluded: they are large, and a draft is a
  // convenience rather than a place to park someone's licence documents.
  let draftNote = document.getElementById('ca-draft-note');
  let saveTimer = null;

  function collect(includeFiles) {
    let data = {};
    let elements = Array.prototype.slice.call(form.elements);
    elements.forEach(function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'file') {
        if (includeFiles && el.files.length) {
          data[el.name] = Array.prototype.map.call(el.files, function (f) {
            return { name: f.name, type: f.type, size: f.size };
          });
        }
        return;
      }
      if (el.type === 'checkbox') {
        // A checkbox that is alone under its name is a single yes/no answer
        // (the consents), so it serialises as a boolean. Genuine multi-select
        // groups stay arrays, and an unchecked group is simply absent.
        if (form.querySelectorAll('[name="' + CSS.escape(el.name) + '"]').length === 1) {
          if (el.checked) data[el.name] = true;
          return;
        }
        if (!el.checked) return;
        if (!data[el.name]) data[el.name] = [];
        data[el.name].push(el.value);
      } else if (el.type === 'radio') {
        if (el.checked) data[el.name] = el.value;
      } else if (el.value !== '') {
        data[el.name] = el.value;
      }
    });
    return data;
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), data: collect(false) }));
      draftNote.textContent = 'Draft saved ' + new Date().toLocaleTimeString();
    } catch (_) {
      // Private browsing, or storage full. The form still works; only the
      // convenience of resuming is lost, so say so rather than failing quietly.
      draftNote.textContent = 'Draft could not be saved in this browser — finish in one sitting.';
    }
  }

  function restoreDraft() {
    let raw;
    try { raw = localStorage.getItem(DRAFT_KEY); } catch (_) { return; }
    if (!raw) return;

    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { return; }
    // Anything could be in storage — an older schema, a half-written value.
    // Apply only what maps onto a control that still exists.
    let data = parsed && typeof parsed === 'object' ? parsed.data : null;
    if (!data || typeof data !== 'object') return;

    Object.keys(data).forEach(function (name) {
      let value = data[name];
      let nodes = form.querySelectorAll('[name="' + CSS.escape(name) + '"]');
      if (!nodes.length) return;

      Array.prototype.forEach.call(nodes, function (el) {
        if (el.type === 'file') return;
        if (el.type === 'checkbox') {
          el.checked = Array.isArray(value) && value.indexOf(el.value) !== -1;
        } else if (el.type === 'radio') {
          el.checked = (el.value === value);
        } else if (typeof value === 'string') {
          el.value = value;
        }
      });
    });

    syncConditionals();
    form.querySelectorAll('[data-counter]').forEach(function (el) {
      let out = form.querySelector('.ca-count[data-for="' + el.id + '"]');
      if (out) out.textContent = String(el.value.length);
    });
    if (parsed.savedAt) {
      draftNote.textContent = 'Draft restored from ' + new Date(parsed.savedAt).toLocaleString();
    }
  }

  form.addEventListener('input', function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 700);
  });
  form.addEventListener('change', function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 300);
  });

  document.getElementById('ca-clear').addEventListener('click', function () {
    if (!window.confirm('Clear the saved draft and empty this form?')) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
    form.reset();
    form.querySelectorAll('.ca-thumb').forEach(function (t) { t.innerHTML = ''; });
    form.querySelectorAll('.ca-field.is-invalid, .ca-consent.is-invalid')
      .forEach(function (n) { n.classList.remove('is-invalid'); });
    form.querySelectorAll('.ca-error').forEach(function (n) { n.remove(); });
    syncConditionals();
    draftNote.textContent = 'Draft cleared.';
  });

  // ── Validation ─────────────────────────────────────────────
  function fieldWrap(el) { return el.closest('.ca-field') || el.closest('.ca-consent'); }

  function setFieldError(el, message) {
    let wrap = fieldWrap(el);
    if (!wrap) return;
    wrap.classList.add('is-invalid');
    let msg = wrap.querySelector('.ca-error');
    if (!msg) {
      msg = document.createElement('span');
      msg.className = 'ca-error';
      msg.id = (el.id || el.name) + '-error';
      wrap.appendChild(msg);
    }
    msg.textContent = message;
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', msg.id);
  }

  function clearFieldError(el) {
    let wrap = fieldWrap(el);
    if (!wrap) return;
    wrap.classList.remove('is-invalid');
    let msg = wrap.querySelector('.ca-error');
    if (msg) msg.remove();
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  }

  let EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validate() {
    let problems = [];

    function require(id, label, test, message) {
      let el = document.getElementById(id) || form.querySelector('[name="' + id + '"]');
      if (!el) return;
      clearFieldError(el);
      if (test(el)) return;
      setFieldError(el, message);
      problems.push({ el: el, label: label, message: message });
    }

    let notEmpty = function (el) { return el.value.trim() !== ''; };

    require('fullName', 'Full name', notEmpty, 'Please tell us your name.');
    require('email', 'Email', function (el) {
      return EMAIL_RE.test(el.value.trim());
    }, 'Please enter an email we can reach you at.');
    require('city', 'City', notEmpty, 'Please enter your city.');
    require('state', 'State', notEmpty, 'Please enter your state.');

    // Optional URLs still have to be URLs if filled in.
    ['website', 'bookingLink'].forEach(function (id) {
      let el = document.getElementById(id);
      if (!el) return;
      clearFieldError(el);
      let v = el.value.trim();
      if (v === '') return;
      try {
        let u = new URL(v);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('scheme');
      } catch (_) {
        let m = 'Please include the full address, starting with https://';
        setFieldError(el, m);
        problems.push({ el: el, label: el.previousElementSibling ? el.previousElementSibling.textContent.trim() : id, message: m });
      }
    });

    [['agreeStandards', 'Clubhouse Professional Standards'], ['agreeTerms', 'Terms & Conditions']]
      .forEach(function (pair) {
        let el = form.querySelector('[name="' + pair[0] + '"]');
        clearFieldError(el);
        if (el.checked) return;
        let m = 'Please accept to continue.';
        setFieldError(el, m);
        problems.push({ el: el, label: pair[1], message: m });
      });

    return problems;
  }

  // Clear a field's error as soon as the person starts fixing it.
  form.addEventListener('input', function (e) {
    if (fieldWrap(e.target) && fieldWrap(e.target).classList.contains('is-invalid')) clearFieldError(e.target);
  });

  let errorBox = document.getElementById('ca-errors');
  let errorTitle = document.getElementById('ca-errors-title');
  let errorList = document.getElementById('ca-errors-list');

  function showErrors(problems) {
    errorList.innerHTML = '';
    errorTitle.textContent = problems.length === 1
      ? 'One thing needs your attention'
      : problems.length + ' things need your attention';

    problems.forEach(function (p) {
      let li = document.createElement('li');
      let a = document.createElement('a');
      a.href = '#';
      a.textContent = p.label + ' — ' + p.message;
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        p.el.scrollIntoView({ block: 'center' });
        p.el.focus({ preventScroll: true });
      });
      li.appendChild(a);
      errorList.appendChild(li);
    });

    errorBox.hidden = false;
    errorBox.scrollIntoView({ block: 'center' });
  }

  // ── File encoding for the payload ──────────────────────────
  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      let fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(file);
    });
  }

  function collectFiles() {
    let jobs = [];
    let total = 0;
    fileInputs.forEach(function (input) {
      Array.prototype.forEach.call(input.files, function (file) {
        total += file.size;
        jobs.push(readAsDataURL(file).then(function (dataUrl) {
          return { field: input.name, name: file.name, type: file.type, size: file.size, data: dataUrl };
        }));
      });
    });
    if (total > MAX_TOTAL_BYTES) {
      return Promise.reject(new Error('Your uploads come to ' + mb(total) +
        '. The limit is ' + mb(MAX_TOTAL_BYTES) + ' — please remove or compress a file.'));
    }
    return Promise.all(jobs);
  }

  // ── Submit ─────────────────────────────────────────────────
  let submitBtn = document.getElementById('ca-submit');
  let done = document.getElementById('ca-done');
  let doneMsg = document.getElementById('ca-done-msg');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    let problems = validate();
    if (problems.length) { showErrors(problems); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    collectFiles().then(function (files) {
      let payload = {
        form: 'clubhouse-coach-application',
        version: 1,
        submittedAt: new Date().toISOString(),
        answers: collect(false),
        files: files,
      };

      if (SUBMIT_ENDPOINT) {
        return fetch(SUBMIT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(function (res) {
          if (!res.ok) throw new Error('The server responded with ' + res.status + '.');
          finish(true, payload);
        });
      }

      // No endpoint configured. Do not imply the application was sent.
      downloadPayload(payload);
      finish(false, payload);
    }).catch(function (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit application';
      showErrors([{
        el: submitBtn,
        label: 'Could not submit',
        message: err && err.message ? err.message : 'Something went wrong. Please try again.',
      }]);
    });
  });

  function downloadPayload(payload) {
    let name = (payload.answers.fullName || 'coach').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = 'clubhouse-coach-application-' + name + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function finish(transmitted, payload) {
    let heading = done.querySelector('h2');
    if (transmitted) {
      try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
      heading.textContent = 'Application received';
      doneMsg.textContent = 'Thanks, ' + (payload.answers.fullName || 'coach').split(' ')[0] +
        '. We review every application by hand and will be in touch about next steps.';
    } else {
      // Nothing was transmitted, so the heading must not say otherwise.
      heading.textContent = 'Application downloaded';
      doneMsg.textContent = 'Your application has been downloaded as a file. It has not reached ' +
        'Clubhouse yet' + (CONTACT_EMAIL ? ' — please email it to ' + CONTACT_EMAIL + '.' : ' — please send it to the Clubhouse team to finish applying.') +
        ' Your draft is kept in this browser in case you need it again.';
    }
    done.hidden = false;
    heading.setAttribute('tabindex', '-1');
    heading.focus();
  }

  // ── Go ─────────────────────────────────────────────────────
  restoreDraft();
  syncConditionals();
})();
