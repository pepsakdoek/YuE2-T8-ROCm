/* Minimal dependency-free i18n for the YuE2 local studio UI.
 *
 * Design notes
 * ------------
 * The original UI hard-codes Simplified Chinese in four files (index.html,
 * app.js, assistant.js, rvc.js) and there was no locale layer of any kind.
 * This file provides one without pulling in a framework:
 *
 *   - strings live in dictionaries registered by the i18n.<module>.js files
 *   - static markup is annotated with data-i18n* attributes
 *   - dynamic markup calls t('some.key') and re-renders on a locale event
 *
 * Locale resolution order: an explicit choice saved in localStorage wins; with
 * nothing saved the browser's own language decides, so a zh-* browser keeps the
 * previous Chinese UI and every other browser starts in English.
 *
 * Both dictionaries are always kept: the Chinese text is not a translation of
 * the English, it is the original wording, so it is preserved verbatim as the
 * `zh` side and `en` is the translation.
 *
 * Conventions
 * -----------
 *   data-i18n="key"             -> textContent (leaf elements only)
 *   data-i18n-text="key"        -> the element's own text only, preserving child
 *                                  elements (use this on labels that wrap an
 *                                  input/select/textarea as a bare text node)
 *   data-i18n-html="key"        -> innerHTML (only for strings containing markup)
 *   data-i18n-placeholder="key" -> placeholder attribute
 *   data-i18n-title="key"       -> title attribute
 *   data-i18n-aria-label="key"  -> aria-label attribute
 *   data-i18n-value="key"       -> value attribute (for option/submit text)
 *   data-i18n-default="key"     -> a pre-filled field value, replaced only while
 *                                  the user has not edited it
 *
 * Interpolation uses {name} placeholders: t('job.age', {minutes: 3}).
 *
 * Key namespaces are per-module so the dictionary files can be edited
 * independently without conflicts:
 *   app.* studio.* nav.* job.* stage.* status.* ui.*   (i18n.studio.js / i18n.app.js)
 *   assistant.*                                        (i18n.assistant.js)
 *   rvc.*                                              (i18n.rvc.js)
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'yue2:locale';
  const SUPPORTED = ['zh', 'en'];
  const FALLBACK = 'zh';
  const DICTS = { zh: {}, en: {} };

  function readSaved() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.includes(saved)) return saved;
    } catch { /* private mode / storage disabled */ }
    return null;
  }

  function detect() {
    const saved = readSaved();
    if (saved) return saved;
    const languages = (navigator.languages && navigator.languages.length)
      ? navigator.languages
      : [navigator.language || ''];
    for (const tag of languages) {
      const lower = String(tag).toLowerCase();
      if (lower.startsWith('zh')) return 'zh';
      if (lower.startsWith('en')) return 'en';
    }
    return FALLBACK;
  }

  let locale = detect();

  /** Merge a module's dictionary into a locale. Later registrations win. */
  function registerLocale(target, entries) {
    if (!SUPPORTED.includes(target)) throw new Error(`Unsupported locale: ${target}`);
    if (!entries || typeof entries !== 'object') return;
    Object.assign(DICTS[target], entries);
  }

  function interpolate(text, params) {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
  }

  function lookup(key) {
    const table = DICTS[locale] || {};
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
    const fallback = DICTS[FALLBACK] || {};
    if (Object.prototype.hasOwnProperty.call(fallback, key)) return fallback[key];
    return null;
  }

  /** Translate a key. Missing keys fall back to Chinese, then to the key itself. */
  function t(key, params) {
    const value = lookup(key);
    if (value === null) {
      warnMissing(key);
      return key;
    }
    return interpolate(value, params);
  }

  const ATTRIBUTES = [
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-title', 'title'],
    ['data-i18n-aria-label', 'aria-label'],
    ['data-i18n-value', 'value'],
  ];

  const warned = new Set();

  function warnMissing(key) {
    if (warned.has(key)) return;
    warned.add(key);
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`[i18n] missing key for locale "${locale}": ${key}`);
    }
  }

  // Elements whose text is user input. `data-i18n` on one of these would blank
  // or overwrite what the user typed every time the language changes, so the
  // attribute is ignored there and the misuse is reported instead. Use
  // data-i18n-placeholder / -title / -aria-label for their attributes, or
  // data-i18n-default for a pre-filled value that must yield to user input.
  const USER_EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

  // element -> the default this module last wrote, so a value the user has since
  // changed is never clobbered.
  const appliedDefaults = new WeakMap();

  /**
   * Replace only the element's own text, leaving child elements untouched.
   *
   * `data-i18n` writes textContent, which is correct for a leaf element but
   * destroys anything nested inside. Most form labels here wrap their control
   * as a bare text node -- <label>风格提示<textarea ...></textarea></label> --
   * so using data-i18n on one would delete the textarea. `data-i18n-text`
   * targets the first non-whitespace direct text node instead, preserving both
   * the control and the surrounding indentation.
   */
  function setDirectText(element, value) {
    for (const node of element.childNodes) {
      if (node.nodeType === 3 /* TEXT_NODE */ && node.nodeValue.trim()) {
        node.nodeValue = value;
        return;
      }
    }
    element.insertBefore(document.createTextNode(value), element.firstChild);
  }

  function applyDefaults(scope) {
    for (const element of scope.querySelectorAll('[data-i18n-default]')) {
      const key = element.getAttribute('data-i18n-default');
      const value = lookup(key);
      if (value === null) { warnMissing(key); continue; }
      const previous = appliedDefaults.get(element);
      const current = 'value' in element ? element.value : element.textContent;
      // Only replace text this module owns, or a field still holding its default.
      if (previous === undefined || current === previous) {
        if ('value' in element) element.value = value; else element.textContent = value;
        appliedDefaults.set(element, value);
      }
    }
  }

  /** Apply translations to a DOM subtree (defaults to the whole document). */
  function apply(root) {
    const scope = root || document;
    const nodes = scope.querySelectorAll ? scope : document;

    // A missing key here used to be silent: the element simply kept its
    // original text, which looked fine but meant an untranslated attribute
    // could ship undetected. Warn instead, so both the browser check and a
    // developer's console surface the gap.
    for (const element of nodes.querySelectorAll('[data-i18n]')) {
      if (USER_EDITABLE.has(element.tagName)) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[i18n] data-i18n on a user-editable element is ignored '
            + `(use data-i18n-placeholder or data-i18n-default): #${element.id || element.tagName}`);
        }
        continue;
      }
      const key = element.getAttribute('data-i18n');
      const value = lookup(key);
      if (value !== null) element.textContent = value; else warnMissing(key);
    }
    for (const element of nodes.querySelectorAll('[data-i18n-html]')) {
      const key = element.getAttribute('data-i18n-html');
      const value = lookup(key);
      if (value !== null) element.innerHTML = value; else warnMissing(key);
    }
    for (const element of nodes.querySelectorAll('[data-i18n-text]')) {
      const key = element.getAttribute('data-i18n-text');
      const value = lookup(key);
      if (value !== null) setDirectText(element, value); else warnMissing(key);
    }
    for (const [dataAttribute, attribute] of ATTRIBUTES) {
      for (const element of nodes.querySelectorAll(`[${dataAttribute}]`)) {
        const key = element.getAttribute(dataAttribute);
        const value = lookup(key);
        if (value !== null) element.setAttribute(attribute, value); else warnMissing(key);
      }
    }
    applyDefaults(nodes);
  }

  function toggleLabel() {
    // Language names are endonyms: each is always written in its own script,
    // so the button reads "English" while the UI is Chinese and "中文" while
    // the UI is English. That is the convention users expect.
    return locale === 'zh' ? 'English' : '中文';
  }

  function syncToggle(button) {
    const control = button || document.getElementById('locale-toggle');
    if (!control) return;
    control.textContent = toggleLabel();
    const label = locale === 'zh' ? t('ui.locale.switchToEnglish') : t('ui.locale.switchToChinese');
    control.setAttribute('aria-label', label);
    control.setAttribute('title', label);
    control.setAttribute('data-locale', locale);
  }

  function setLocale(next, options) {
    if (!SUPPORTED.includes(next) || next === locale) {
      if (!SUPPORTED.includes(next)) return locale;
    }
    locale = next;
    try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* ignore */ }
    document.documentElement.setAttribute('lang', locale === 'zh' ? 'zh-CN' : 'en');
    apply(document);
    syncToggle();
    document.dispatchEvent(new CustomEvent('yue2:locale', { detail: { locale } }));
    if (!options || options.persist !== false) { /* already persisted above */ }
    return locale;
  }

  function toggle() {
    return setLocale(locale === 'zh' ? 'en' : 'zh');
  }

  function current() { return locale; }

  function wire() {
    const control = document.getElementById('locale-toggle');
    if (control) control.addEventListener('click', () => toggle());
    document.documentElement.setAttribute('lang', locale === 'zh' ? 'zh-CN' : 'en');
    apply(document);
    syncToggle(control);
  }

  window.YUE2_I18N = {
    t, apply, setLocale, toggle, current, registerLocale,
    supported: SUPPORTED.slice(),
    dicts: DICTS,
  };
  // Global shortcut so the three existing scripts can call t(...) directly.
  window.t = t;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
