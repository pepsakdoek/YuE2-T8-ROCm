# WebUI internationalisation (English / Chinese)

The studio UI ships both languages and a toggle in the header. This documents how
the layer works, the rules that keep it from breaking the app, and how to verify a
change.

## At a glance

| Piece | File | Role |
|---|---|---|
| Engine | `app/web/i18n.js` | `t()`, `apply()`, locale resolution, the toggle |
| Browser dictionaries | `app/web/i18n.studio.js`, `i18n.app.js`, `i18n.assistant.js`, `i18n.rvc.js` | One per UI module, so they can be edited independently |
| Server catalogue | `app/yue2_app/i18n.py` + `i18n_catalog.py` | Prose the server generates (job errors, validation failures) |
| Server wiring | `app/yue2_app/service.py` | `localize_payload()` over every JSON response |
| Header injection | `app/web/app.js` (`api()`) | Sends `X-YuE2-Locale` on every request |

Locale resolution: an explicit choice in `localStorage` wins; otherwise the
browser's own languages decide, so a `zh-*` browser keeps the original Chinese UI
and anything else starts in English. Clicking the toggle always wins and persists.
The button shows the *target* language as an endonym, so it reads "English" while
the UI is Chinese and "中文" while the UI is English — that is intended, and the
verification script excludes it when counting untranslated text.

## Markup conventions

Strings live in dictionaries keyed by a dot-namespaced key, and markup is
annotated with an attribute saying which key applies:

| Attribute | Effect |
|---|---|
| `data-i18n` | Replaces `textContent`. **Leaf elements only.** |
| `data-i18n-text` | Replaces the element's *own* text, preserving child elements. Use this on a label that wraps its control as a bare text node. |
| `data-i18n-html` | Replaces `innerHTML`; only for strings containing markup. |
| `data-i18n-placeholder` | `placeholder` attribute. |
| `data-i18n-title` | `title` attribute. |
| `data-i18n-aria-label` | `aria-label` attribute. |
| `data-i18n-value` | `value` attribute (for option/submit text). |
| `data-i18n-default` | A pre-filled field value, replaced only while the user has not edited it. |

Keep the original Chinese in the element as a pre-JS fallback; the attribute wins
at runtime, so the page still reads correctly if a dictionary fails to load.

### Two rules that exist because breaking them breaks the app

1. **Never put `data-i18n` on an `<input>`, `<textarea>` or `<select>`.**
   `apply()` writes `textContent`, so it would wipe what the user typed on every
   language switch. The engine ignores the attribute there and logs a console
   warning instead. Use `data-i18n-placeholder` / `-title` / `-aria-label`, or
   `data-i18n-default` for a seeded value.
2. **`data-i18n-text`, not `data-i18n`, on wrapping labels.** Most labels here
   look like `<label>风格提示<textarea …></textarea></label>`. Plain `data-i18n`
   would delete the textarea.

## Option values are protocol data — never translate them

Several dropdowns submit their option text as the value, and
`app/yue2_app/assistant_rules/engine.py` compares those values with `==`
(`'中文'`, `'标准 / Standard'`, `'保留 / Preserve'`, …). They are therefore kept
byte-identical, and only the *label* is translated:

```html
<option value="中文" data-i18n="assistant.option.chinese">中文</option>
```

```js
// assistant.js — value stays, label is translated
const OPTION_LABELS = { '中文': 'assistant.option.chinese', … };
opt.value = text;
opt.textContent = optionLabel(text);
```

This includes the values the server supplies through `/api/assistant/config`
(`lyrics_modes`, `quality_sources`, …), which is why the map covers the engine
constants directly rather than only the markup.

The upside of this choice: no `engine.py` change, no migration, and saved drafts
that already contain `'中文'` keep working.

## Server-generated prose

Job summaries, validation errors and worker failures are produced in Python, so
the browser cannot translate them from its own dictionaries. Two mechanisms:

* **Summaries** are stored on the job, which freezes the language active when it
  was queued. `JobStore._summary_spec` therefore also returns a locale-neutral
  `summary_key` + params, and `app.js` renders that (`jobSummary()`), falling back
  to the stored string for older jobs and for user-supplied summaries (style
  prompts), which have no key.
* **Errors and messages** are translated at the response boundary.
  `localize_payload()` walks every JSON payload and translates the prose in the
  `error` / `message` fields and in `errors` / `warnings` / `issues` lists. The
  locale comes from the `X-YuE2-Locale` request header.

`app/yue2_app/i18n_catalog.py` is a **gettext-style catalogue keyed by the Chinese
source string** rather than an invented key name. The strings already existed in
~23 modules, so keying by source avoided rewriting hundreds of raise sites, and an
unrecognised string passes through unchanged — a gap degrades to the previous
behaviour instead of showing a raw key. Messages built with f-strings are covered
by an ordered list of regex patterns whose replacements may reference capture
groups.

### What is deliberately excluded from the catalogue

* **LLM prompt text** (`assistant_rules/engine.py` in full, parts of
  `assistant_data.py`). Translating a prompt changes what the model is told, which
  changes generated output — a behaviour change, not a localisation.
* **Enum / protocol values** compared with `==` or sent to the backend.
* **User data** — style prompts, lyrics, default project and voice names
  (`我的音色`, `默认音色`, `导入的音色`), which are persisted into project files.
* **Log-only output** that never reaches a user.
* The log-parsing regex in `rvc_training.py`.

## Verification

Four tools, each catching a different failure. Run all four after touching i18n.

```powershell
# 1. Static coverage: every referenced key defined in BOTH locales, no staleness,
#    and no option value that has drifted from the engine's constants
runtime\python.exe scripts\rocm\check_i18n_coverage.py

# 2. Unit tests: catalogue drift, translation behaviour, protocol-value coupling,
#    summary-key parity between server and browser
runtime\python.exe scripts\rocm\run_tests.py

# 3. Server catalogue over HTTP: 12 probes across many endpoints, comparing the
#    zh and en responses to the same request
runtime\python.exe scripts\rocm\verify_server_i18n.py

# 4. Real browser: the toggle switches, persists, restores; the engine's own
#    conventions hold; the client sends its locale and the server answers in it
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\runtime\playwright"
runtime\python.exe scripts\rocm\verify_webui_i18n.py
```

Why a browser is required: **a missing key is not an error.** `apply()` leaves the
element's original Chinese text in place, so a half-translated page still looks
plausible. `check_i18n_coverage.py` closes that gap statically, the test suite
locks the couplings, and the browser check proves the runtime behaviour and
asserts the engine's semantics (wrapped control survives, user input is never
overwritten, a seeded default yields to edits).

`verify_webui_i18n.py` also reports `cjk_by_section_en` — remaining Chinese per
region in English mode. That is the honest completeness metric. Two measurement
details matter: a `<textarea>`'s original content stays in the DOM as a text node
after `.value` is replaced, so the count reads live values for form fields; and
the locale button shows the target language as an endonym, so it is excluded.

## Coverage as it stands

`cjk_by_section_en` reports **17 characters in English mode**, all in the
AI-assistant panel: the two provider brand names (`贞贞平价小屋`, `贞贞的 AI 工坊`) in
the provider dropdown and the signup link. They are proper nouns with no official
English form and are left as the server sends them. Everything else — `header`,
`nav`, task centre, create, score plan, cover, voices, history, footer and every
option label whose value must stay Chinese — is translated.

## Known gaps

* The 17 characters above (brand names).
* A job card already on screen keeps the language it was rendered in until the
  page re-renders it (the app polls while a job is active). The doctor result line
  and the model-directory status message likewise keep the language in force when
  the action ran, because re-deriving them would require re-running the action or
  would discard an unsaved path edit.
* `voice_worker._audio_path` composes its message from a Chinese label and a path;
  the catalogue can only drop the label. A cleaner fix belongs in that file.
* Chinese list separators (`、` and `；`) survive in two places where the source
  joins a list: `rvc_preflight` and `rvc_worker`.
* Messages outside the catalogue reach the UI in Chinese. Because unknown strings
  pass through unchanged, a gap shows as Chinese text rather than a broken key —
  the intended failure mode.
