"""Locale-aware rendering for browser-facing strings that originate in Python.

Most UI text lives in the browser and is handled by app/web/i18n.js. This module
covers the remainder: messages the server itself generates and hands to the
browser -- job summaries, validation errors, worker failure text.

WHY A SOURCE-STRING CATALOGUE
-----------------------------
This is gettext-style: entries are keyed by the Chinese source string rather
than by an invented key name. Two reasons:

  * the strings already exist in ~23 modules; renaming 400 call sites would be a
    far larger change than this feature justifies, and every raise site would
    have to be touched;
  * an unrecognised string passes through unchanged, so a gap degrades to the
    current behaviour instead of showing a raw key to the user.

The cost is that editing a Chinese message without updating the catalogue makes
that one message fall back silently. `tests/test_i18n_catalog.py` guards this by
asserting every catalogue key still occurs in the source tree.

TEMPLATES
---------
Exact matching cannot cover f-strings such as f"转谱 {name}". Those are handled
by an ordered list of regex patterns whose replacement may reference capture
groups (\1, \2, ...).

Locale resolution is by request header (X-YuE2-Locale). Anything absent or
unrecognised resolves to Chinese, which preserves the original behaviour for
plain API clients and for the CLI.
"""
from __future__ import annotations

import re

SUPPORTED = ("zh", "en")
DEFAULT_LOCALE = "zh"
HEADER = "X-YuE2-Locale"

try:  # catalogue kept in a separate module so translators own the data alone
    from .i18n_catalog import EXACT, PATTERNS
except ImportError:  # pragma: no cover - catalogue is optional
    EXACT, PATTERNS = {}, {}

_EN_EXACT = EXACT.get("en", {}) if EXACT else {}
_EN_PATTERNS = PATTERNS.get("en", ()) if PATTERNS else ()

# Compiled lazily and cached; patterns are few, so this is cheap either way.
_COMPILED: list[tuple[re.Pattern, str]] | None = None


def resolve_locale(value: str | None) -> str:
    """Map an Accept-Language-ish header value onto a supported locale."""
    if not value:
        return DEFAULT_LOCALE
    tag = str(value).strip().lower()
    if not tag:
        return DEFAULT_LOCALE
    # Take the first tag of a comma list and ignore its quality weights.
    primary = re.split(r"[,;]", tag)[0].strip()
    if primary.startswith("en"):
        return "en"
    if primary.startswith("zh"):
        return "zh"
    return DEFAULT_LOCALE


def _compiled() -> list[tuple[re.Pattern, str]]:
    global _COMPILED
    if _COMPILED is None:
        _COMPILED = [(re.compile(pattern), replacement) for pattern, replacement in _EN_PATTERNS]
    return _COMPILED


def translate(text, locale: str = DEFAULT_LOCALE):
    """Render a server-generated message in `locale`; unknown input is returned as-is."""
    if not isinstance(text, str) or not text or locale != "en":
        return text
    exact = _EN_EXACT.get(text)
    if exact is not None:
        return exact
    for pattern, replacement in _compiled():
        if pattern.fullmatch(text):
            return pattern.sub(replacement, text)
    return text


def catalog_entries() -> dict:
    """Introspection helper for the drift test and for coverage reporting."""
    return {"exact": dict(_EN_EXACT), "patterns": tuple(_EN_PATTERNS)}
