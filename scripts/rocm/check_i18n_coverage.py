#!/usr/bin/env python3
"""Static i18n coverage check for the WebUI.

Static, not behavioural, on purpose: a missing key does NOT throw and does NOT
blank the UI -- `apply()` leaves the element's original Chinese text in place.
That means a half-translated page still looks plausible in a browser, so the
only reliable way to prove coverage is to compare the keys the code asks for
against the keys the dictionaries define.

It checks, for each locale:
  * every key referenced by index.html (data-i18n*) is defined
  * every key passed to t('...') in the JS modules is defined
  * the zh and en dictionaries define exactly the same key set
  * (informational) keys defined but never referenced

Usage:
    runtime\\python.exe scripts\\rocm\\check_i18n_coverage.py
    runtime\\python.exe scripts\\rocm\\check_i18n_coverage.py --json report.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "app" / "web"

DICTIONARIES = ("i18n.studio.js", "i18n.app.js", "i18n.assistant.js", "i18n.rvc.js")
CONSUMERS = ("app.js", "assistant.js", "rvc.js", "i18n.js")

# data-i18n and its attribute variants, including -text and -default
ATTR = re.compile(r'data-i18n(?:-html|-text|-placeholder|-title|-aria-label|-value|-default)?="([^"]+)"')
# t('key') / t("key") -- only literal keys are statically checkable
CALL = re.compile(r"""\bt\(\s*(['"])([A-Za-z][A-Za-z0-9_.]*)\1""")
# dictionary entries sit at exactly two spaces of indent
ENTRY = re.compile(r"^\s{2}'([^']+)'\s*:", re.MULTILINE)


def strip_js_comments(text: str) -> str:
    """Remove // and /* */ comments, string-aware.

    Needed because i18n.js documents its own API with example calls such as
    t('job.age'), which would otherwise be counted as real references. This is a
    scanner rather than a regex so that '//' inside string literals (URLs) and
    quotes inside comments do not confuse it; it does not attempt to handle
    regex literals, which these files do not use.
    """
    out = []
    index, length = 0, len(text)
    quote = None
    while index < length:
        char = text[index]
        if quote:
            out.append(char)
            if char == "\\" and index + 1 < length:
                out.append(text[index + 1])
                index += 2
                continue
            if char == quote:
                quote = None
            index += 1
            continue
        if char in "\"'`":
            quote = char
            out.append(char)
            index += 1
            continue
        if char == "/" and index + 1 < length:
            following = text[index + 1]
            if following == "/":
                newline = text.find("\n", index)
                index = length if newline < 0 else newline
                continue
            if following == "*":
                closing = text.find("*/", index + 2)
                index = length if closing < 0 else closing + 2
                continue
        out.append(char)
        index += 1
    return "".join(out)


def dictionary_keys(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    result = {}
    for locale in ("zh", "en"):
        marker = f"registerLocale('{locale}', {{"
        start = text.find(marker)
        if start < 0:
            result[locale] = set()
            continue
        # The block ends at the first line that closes it at column zero.
        end = text.find("\n});", start)
        block = text[start:end if end > 0 else len(text)]
        result[locale] = set(ENTRY.findall(block))
    return result


# Keys are sometimes held in a map and passed to t() through a variable, e.g.
#   const label = {validated: 'assistant.abcStatus.validated'}; ... t(label[state])
# Those are invisible to the t('...') scan, so a quoted literal that looks like a
# namespaced key is also counted as a reference. The namespace filter keeps
# unrelated dotted strings from being mistaken for keys.
LITERAL = re.compile(r"""(['"])([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)\1""")
NAMESPACES = ("app.", "assistant.", "rvc.", "studio.", "ui.", "nav.", "health.",
              "update.", "job.", "stage.", "status.", "result.", "error.",
              "summary.", "progress.", "outcome.", "field.", "cost.", "provider.",
              "models.", "config.", "capability.", "send.", "transfer.", "confirm.",
              "confirm", "export.", "draft.", "plan.", "cover.", "abc", "hint.")


def looks_like_key(value: str) -> bool:
    return value.startswith(NAMESPACES)


# --- protocol-value coupling -------------------------------------------------
# assistant.js maps option VALUES to label keys. The values are protocol data
# that app/yue2_app/assistant_rules/engine.py compares against, so a typo in the
# map would silently stop a label from translating, and a value that no longer
# matches the engine would mean the two have drifted apart.
ENGINE = ROOT / "app" / "yue2_app" / "assistant_rules" / "engine.py"
ASSISTANT_JS = WEB / "assistant.js"
PROTOCOL_CONSTANT = re.compile(r'^([A-Z][A-Z0-9_]*) = "([^"]+)"', re.MULTILINE)
OPTION_ENTRY = re.compile(r"^\s{2}'([^']+)':\s*'assistant\.option\.", re.MULTILINE)
LANGUAGE_VALUES = {"中文", "English", "日本語", "한국어"}


def protocol_value_report() -> dict:
    constants = dict(PROTOCOL_CONSTANT.findall(ENGINE.read_text(encoding="utf-8")))
    # Drop non-option constants that merely happen to be uppercase strings, such
    # as the pinned upstream commit hash.
    constants = {name: value for name, value in constants.items()
                 if not re.fullmatch(r"[0-9a-f]{7,64}", value)}
    mapped = set(OPTION_ENTRY.findall(ASSISTANT_JS.read_text(encoding="utf-8")))
    known = set(constants.values()) | LANGUAGE_VALUES
    return {
        "mapped": sorted(mapped),
        "stale": sorted(v for v in mapped if v not in known),
        "unmapped": sorted(set(constants.values()) - mapped),
        "constants": len(constants),
    }


def inventory(directory: Path) -> dict:
    """Collect defined and referenced keys from the web module."""
    defined = {"zh": set(), "en": set()}
    per_file = {}
    for name in DICTIONARIES:
        keys = dictionary_keys(directory / name)
        per_file[name] = keys
        defined["zh"] |= keys["zh"]
        defined["en"] |= keys["en"]

    used = {}        # key -> set of referrers, from t('...') and data-i18n attrs
    literal = set()  # key-shaped literals, anywhere in the module
    dynamic = []

    html = (directory / "index.html").read_text(encoding="utf-8")
    for key in ATTR.findall(html):
        used.setdefault(key, set()).add("index.html")
    for _, value in LITERAL.findall(html):
        if looks_like_key(value):
            literal.add(value)

    for name in CONSUMERS:
        text = strip_js_comments((directory / name).read_text(encoding="utf-8"))
        for _, key in CALL.findall(text):
            used.setdefault(key, set()).add(name)
        for _, value in LITERAL.findall(text):
            if looks_like_key(value):
                literal.add(value)
        for match in re.finditer(r"\bt\(\s*([A-Za-z_$][\w$]*)", text):
            dynamic.append(f"{name}: t({match.group(1)})")

    return {"defined": defined, "per_file": per_file, "used": used,
            "literal": literal, "dynamic": dynamic}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--json", type=Path, help="also write the report as JSON")
    parser.add_argument("--quiet", action="store_true", help="only report problems")
    parser.add_argument("--dir", type=Path, default=WEB, help="web module directory")
    args = parser.parse_args(argv)

    inventory_result = inventory(args.dir)
    defined = inventory_result["defined"]
    per_file = inventory_result["per_file"]
    used = inventory_result["used"]
    literal = inventory_result["literal"]
    dynamic = inventory_result["dynamic"]

    # A literal-shaped reference counts as a use for dead-key detection, and also
    # for missing-key detection because these are namespaced keys either way.
    referenced = set(used) | {key for key in literal if looks_like_key(key)}

    missing_zh = sorted(k for k in referenced if k not in defined["zh"])
    missing_en = sorted(k for k in referenced if k not in defined["en"])
    only_zh = sorted(defined["zh"] - defined["en"])
    only_en = sorted(defined["en"] - defined["zh"])
    unused = sorted(k for k in defined["zh"] if k not in referenced)

    problems = len(missing_zh) + len(missing_en) + len(only_zh) + len(only_en)

    if not args.quiet:
        print("=== dictionaries ===")
        for name in DICTIONARIES:
            print(f"  {name:<20} zh={len(per_file[name]['zh']):<5} en={len(per_file[name]['en'])}")
        print(f"  {'TOTAL':<20} zh={len(defined['zh']):<5} en={len(defined['en'])}")
        print(f"\n=== referenced keys: {len(used)} ===")

    if missing_zh or missing_en:
        print("\nMISSING KEYS (referenced but not defined):")
        for key in sorted(set(missing_zh) | set(missing_en)):
            where = ",".join(sorted(used.get(key, [])))
            tag = []
            if key in missing_zh:
                tag.append("zh")
            if key in missing_en:
                tag.append("en")
            print(f"  [{'+'.join(tag)}] {key}   <- {where}")

    if only_zh or only_en:
        print("\nLOCALE MISMATCH (defined in one locale only):")
        for key in only_zh:
            print(f"  zh-only: {key}")
        for key in only_en:
            print(f"  en-only: {key}")

    if dynamic:
        print(f"\nDYNAMIC t() CALLS not statically checkable: {len(dynamic)}")
        for item in sorted(set(dynamic))[:20]:
            print(f"  {item}")

    protocol = protocol_value_report()
    if protocol["stale"]:
        print("\nSTALE OPTION VALUES (mapped in assistant.js but not an engine constant):")
        for value in protocol["stale"]:
            print(f"  {value!r}")
    if protocol["unmapped"] and not args.quiet:
        print(f"\nENGINE CONSTANTS WITH NO LABEL MAPPING: {len(protocol['unmapped'])}")
        for value in protocol["unmapped"]:
            print(f"  {value!r}")

    problems += len(protocol["stale"])

    if unused and not args.quiet:
        print(f"\nDEFINED BUT UNUSED: {len(unused)}")
        for key in unused[:25]:
            print(f"  {key}")
        if len(unused) > 25:
            print(f"  ... and {len(unused) - 25} more")

    report = {
        "defined": {k: len(v) for k, v in defined.items()},
        "used": len(used),
        "missing_zh": missing_zh,
        "missing_en": missing_en,
        "only_zh": only_zh,
        "only_en": only_en,
        "unused": unused,
        "dynamic": sorted(set(dynamic)),
        "per_file": {k: {"zh": len(v["zh"]), "en": len(v["en"])} for k, v in per_file.items()},
    }
    if args.json:
        args.json.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print()
    if problems:
        print(f"FAIL: {problems} coverage problem(s) "
              f"(missing zh={len(missing_zh)}, missing en={len(missing_en)}, "
              f"zh-only={len(only_zh)}, en-only={len(only_en)})")
        return 1
    print(f"PASS: all {len(used)} referenced keys defined in both locales "
          f"({len(defined['zh'])} keys)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
