/* spectastic theme boot — render-blocking, runs in <head> before first paint.
   Applies the saved theme + mode (016-theme-support, plan D-002) and migrates
   the legacy mode-only `spectastic-theme` value. Single source for the theme
   registry + persistence; the switcher UI in spec.js reads window.__spectastic. */
(function () {
  'use strict';
  var KEY_THEME = 'spectastic-theme', KEY_MODE = 'spectastic-mode';
  var THEMES = [
    { id: 'spectastic-calm',  label: 'Calm'  },
    { id: 'spectastic-vivid', label: 'Vivid' }
  ];
  var MODES = ['light', 'dark'];
  var DEF_THEME = 'spectastic-calm', DEF_MODE = 'light';
  function ids() { return THEMES.map(function (t) { return t.id; }); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function resolve() {
    var theme = get(KEY_THEME), mode = get(KEY_MODE);
    /* Legacy: the old key stored a MODE ('light'|'dark'). Migrate it once. */
    if (theme === 'light' || theme === 'dark') {
      if (mode == null) { mode = theme; set(KEY_MODE, mode); }
      theme = DEF_THEME; set(KEY_THEME, theme);
    }
    if (ids().indexOf(theme) === -1) theme = DEF_THEME;
    if (MODES.indexOf(mode) === -1) mode = DEF_MODE;
    return { theme: theme, mode: mode };
  }

  function applyAttr(name, value) {
    var el = document.documentElement;
    if (el) el.setAttribute(name, value);
  }

  var state = resolve();
  applyAttr('data-theme', state.theme);
  applyAttr('data-mode', state.mode);

  window.__spectastic = {
    THEMES: THEMES,
    MODES: MODES,
    current: resolve,
    setTheme: function (id) {
      if (ids().indexOf(id) === -1) return;
      set(KEY_THEME, id);
      applyAttr('data-theme', id);
    },
    setMode: function (m) {
      if (MODES.indexOf(m) === -1) return;
      set(KEY_MODE, m);
      applyAttr('data-mode', m);
    }
  };
})();
