/* spectastic — progressive enhancement for HTML specs
   Everything degrades to readable static HTML if this script never loads.
*/
(() => {
  'use strict';

  /* ---- 1. Tabs ------------------------------------------------------ */
  document.querySelectorAll('spec-tabs').forEach(group => {
    const tabs = [...group.querySelectorAll('spec-tab')];
    if (!tabs.length) return;
    const list = document.createElement('div');
    list.setAttribute('role', 'tablist');
    tabs.forEach((tab, i) => {
      const id = tab.id || `tab-${Math.random().toString(36).slice(2, 7)}`;
      tab.id = id;
      const btn = document.createElement('button');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-controls', id);
      btn.textContent = tab.getAttribute('label') || `Tab ${i + 1}`;
      btn.addEventListener('click', () => select(i));
      list.appendChild(btn);
    });
    group.insertBefore(list, tabs[0]);
    const select = i => {
      list.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-selected', j === i));
      tabs.forEach((t, j) => t.hidden = j !== i);
    };
    select(0);
  });

  /* ---- 2. Anchor-link affordance on headings & requirements -------- */
  document.querySelectorAll('h2[id], h3[id], spec-requirement[id], spec-decision[id]').forEach(el => {
    el.style.cursor = 'pointer';
    el.title = 'Click to copy link';
    el.addEventListener('click', e => {
      if (e.target.closest('a, button, summary, details')) return;
      const url = location.origin + location.pathname + '#' + el.id;
      navigator.clipboard?.writeText(url);
      flash(el);
    });
  });
  const flash = el => {
    const o = el.style.background;
    el.style.transition = 'background .4s';
    el.style.background = 'var(--c-gold)';
    setTimeout(() => el.style.background = o, 600);
  };

  /* ---- 3. Auto-build conformance index ----------------------------- */
  const conf = document.querySelector('spec-conformance');
  if (conf) {
    const reqs = [...document.querySelectorAll('spec-requirement[id]')];
    if (reqs.length) {
      const ol = document.createElement('ol');
      reqs.forEach(r => {
        const li = document.createElement('li');
        const id = document.createElement('code');
        id.textContent = r.id;
        const pri = document.createElement('spec-pill');
        pri.textContent = (r.getAttribute('priority') || 'must').toUpperCase();
        const text = document.createElement('a');
        text.href = '#' + r.id;
        const firstP = r.querySelector('p');
        text.textContent = (firstP ? firstP.textContent : r.textContent).trim().replace(/\s+/g, ' ');
        li.append(id, pri, text);
        ol.appendChild(li);
      });
      conf.appendChild(ol);
    }
  }

  /* ---- 4. <dfn> cross-linking -------------------------------------- */
  const defs = new Map();
  document.querySelectorAll('dfn[id]').forEach(d => defs.set(d.textContent.trim().toLowerCase(), d.id));
  document.querySelectorAll('p, li, dd, td').forEach(el => {
    if (el.querySelector('dfn, code, pre, a')) return;
    const txt = el.textContent;
    defs.forEach((id, term) => {
      if (txt.toLowerCase().includes(term) && !el.dataset.dfnLinked) {
        const re = new RegExp(`\\b(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'i');
        const html = el.innerHTML.replace(re, m => `<a href="#${id}" class="dfn-ref">${m}</a>`);
        if (html !== el.innerHTML) { el.innerHTML = html; el.dataset.dfnLinked = '1'; }
      }
    });
  });

  /* ---- 5. Reading-time estimate ------------------------------------ */
  const wc = document.body.innerText.trim().split(/\s+/).length;
  const min = Math.max(1, Math.round(wc / 230));
  document.querySelectorAll('[data-reading-time]').forEach(el => { el.textContent = `${min} min read · ${wc.toLocaleString()} words`; });

  /* ---- 5b. spec-budget — live size gauge --------------------------- */
  document.querySelectorAll('spec-budget').forEach(el => {
    const wordBudget   = +el.getAttribute('words')   || 1500;
    const reqBudget    = +el.getAttribute('reqs')    || 20;
    const minBudget    = +el.getAttribute('minutes') || 12;
    const reqCount     = document.querySelectorAll('spec-requirement').length;
    const band = pct => pct <= 70 ? 'green' : pct <= 100 ? 'amber' : 'red';
    const rows = [
      ['Words',        wc,       wordBudget,   `${wc.toLocaleString()} / ${wordBudget.toLocaleString()}`],
      ['Requirements', reqCount, reqBudget,    `${reqCount} / ${reqBudget}`],
      ['Read time',    min,      minBudget,    `${min} / ${minBudget} min`]
    ];
    let worstBand = 'green';
    el.innerHTML = rows.map(([label, actual, budget, valueText]) => {
      const pct = Math.round((actual / budget) * 100);
      const b   = band(pct);
      if (b === 'red')   worstBand = 'red';
      else if (b === 'amber' && worstBand !== 'red') worstBand = 'amber';
      const w = Math.min(100, pct);
      return `<div class="row" data-band="${b}">
        <span class="label">${label}</span>
        <span class="bar"><span style="width:${w}%"></span></span>
        <span class="value">${valueText}</span>
      </div>`;
    }).join('');
    el.setAttribute('data-overall', worstBand);
    const hint = worstBand === 'red'
      ? `Over budget. Consider splitting: see the parent spec or extract slices via <code>/spectastic.spec</code>.`
      : worstBand === 'amber'
        ? `Approaching the slicing threshold (Larson: specs over 1,500 words must be split).`
        : `Healthy size — under the 70% threshold.`;
    el.insertAdjacentHTML('beforeend', `<div class="hint">${hint}</div>`);
  });

  /* ---- 5c. defer-to validation ------------------------------------- */
  /* spec-out-of-scope items with missing defer-to are styled via CSS,
     but also log a console warning so a future validator can catch them. */
  document.querySelectorAll('spec-out-of-scope li').forEach((li, i) => {
    const dt = li.getAttribute('defer-to');
    if (!dt) console.warn(`<spec-out-of-scope> item ${i + 1} missing defer-to attribute:`, li.textContent.trim().slice(0, 60));
  });

  /* ---- 6. spec-delta target click-through -------------------------- */
  document.querySelectorAll('spec-delta[target]').forEach(el => {
    el.style.cursor = 'pointer';
    el.title = `Jump to ${el.getAttribute('target')}`;
    el.addEventListener('click', e => {
      if (e.target.closest('a, button, summary, details, input, textarea')) return;
      const id = el.getAttribute('target');
      const t = document.getElementById(id);
      if (t) { t.scrollIntoView({behavior: 'smooth', block: 'start'}); return; }
      /* Cross-file target: link to spec.html#id */
      const specHref = el.dataset.specHref || './spec.html';
      location.href = `${specHref}#${id}`;
    });
  });

  /* ---- 7. Theme + mode switcher ------------------------------------ */
  /* Registry, persistence and legacy migration live in theme-boot.js
     (window.__spectastic), which already applied the saved theme + mode to
     <html> before first paint. This block is pure progressive enhancement:
     with JS off the document still renders in its default/persisted look. */
  const themeApi = window.__spectastic;
  const toggle = document.querySelector('[data-theme-toggle]');
  if (themeApi && toggle) {
    /* A controls container sits just before the existing footer toggle. */
    const controls = document.createElement('span');
    controls.className = 'theme-controls';
    toggle.parentNode.insertBefore(controls, toggle);

    /* Sync any UI to the live <html> attributes. Extended by the theme
       <select> (US1) and the mode toggle (US2). */
    const reflect = () => {
      const { theme, mode } = themeApi.current();
      controls.dataset.theme = theme;
      controls.dataset.mode = mode;
      reflect.handlers.forEach((fn) => fn(theme, mode));
    };
    reflect.handlers = [];

    /* US1 — theme <select>, built from the registry. Adding a future theme
       touches only the registry in theme-boot.js, never this markup. */
    const select = document.createElement('select');
    select.className = 'theme-select';
    select.setAttribute('aria-label', 'Theme');
    themeApi.THEMES.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => themeApi.setTheme(select.value));
    controls.appendChild(select);
    reflect.handlers.push((theme) => { select.value = theme; });

    /* US2 — the existing footer toggle now flips light/dark mode. */
    toggle.addEventListener('click', () => {
      themeApi.setMode(themeApi.current().mode === 'dark' ? 'light' : 'dark');
      reflect();
    });
    reflect.handlers.push((theme, mode) => {
      toggle.textContent = mode === 'dark' ? 'dark' : 'light';
      toggle.setAttribute('aria-pressed', String(mode === 'dark'));
    });

    reflect();
  }
})();
