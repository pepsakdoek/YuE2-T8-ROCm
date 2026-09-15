#!/usr/bin/env python3
"""Prove the server-side catalogue works, end to end, over HTTP.

The unit tests check the catalogue as data; the browser check proves one error
message round-trips. This exercises a spread of real endpoints and compares the
`zh` and `en` responses to the same request, which is the only way to see that
`localize_payload()` reaches the messages the catalogue was written for.

For each probe it reports one of:
  localised          zh is Chinese and en is a different, Chinese-free string
  language-neutral   the message contains no Chinese to begin with (e.g. a raw
                     stdlib parse error), so both locales are identical
  unchanged          zh is Chinese and en matches it -- message is not catalogued
  still-CJK          en is still Chinese although zh was too -- a real gap

"unchanged" is not automatically a failure: prompts, protocol values, user data
and log-only strings are excluded from the catalogue on purpose. A "still-CJK"
result on a message that should be user-facing is a failure, and the named
expectations below encode the cases we do require to translate.

Usage:
    runtime\\python.exe scripts\\rocm\\verify_server_i18n.py
    runtime\\python.exe scripts\\rocm\\verify_server_i18n.py --service http://127.0.0.1:8189
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request

CJK = re.compile(r"[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]")

# (label, method, path, body, must_translate)
# must_translate=True means the message is user-facing and MUST come back in
# English; False means only report what happens.
PROBES = (
    ("invalid job id", "GET", "/api/jobs/does-not-exist", None, True),
    ("unknown endpoint", "GET", "/api/nope", None, True),
    ("bad content type", "POST", "/api/jobs", b"notjson", True),
    ("malformed json", "POST", "/api/jobs", b"{", True),
    ("unsupported kind", "POST", "/api/jobs",
     json.dumps({"kind": "definitely_not_a_kind", "request": {}}).encode(), True),
    ("cover needs two groups", "POST", "/api/jobs",
     json.dumps({"kind": "reference_cover", "request": {}}).encode(), True),
    ("transcribe without models", "POST", "/api/jobs",
     json.dumps({"kind": "transcribe", "request": {"source_path": "uploads/x.flac"}}).encode(), True),
    ("voice_convert without models", "POST", "/api/jobs",
     json.dumps({"kind": "voice_convert", "request": {}}).encode(), True),
    ("rvc training unavailable", "POST", "/api/jobs",
     json.dumps({"kind": "rvc_train", "request": {}}).encode(), True),
    ("bad budget", "POST", "/api/jobs",
     json.dumps({"kind": "generate", "request": {"memory_budget_gib": 1}}).encode(), False),
    ("missing file path", "GET", "/api/file", None, True),
    ("unknown rvc endpoint", "GET", "/api/rvc/nope", None, False),
)


def call(base: str, method: str, path: str, body, locale: str):
    request = urllib.request.Request(base + path, method=method, data=body)
    request.add_header("X-YuE2-Locale", locale)
    if body is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")
    except Exception as error:  # connection refused, timeout, ...
        return 0, f"{type(error).__name__}: {error}"


def message_of(payload: str) -> str:
    """Pull the human-facing part out of an error body."""
    try:
        data = json.loads(payload)
    except Exception:
        return payload.strip()
    if isinstance(data, dict):
        for key in ("error", "message", "detail"):
            if isinstance(data.get(key), str):
                return data[key]
    return payload.strip()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--service", default="http://127.0.0.1:8189")
    args = parser.parse_args(argv)
    base = args.service.rstrip("/")

    status, _ = call(base, "GET", "/api/health", None, "en")
    if status != 200:
        print(f"service not reachable at {base} (health returned {status})")
        return 2

    failures, unchanged = [], []
    print(f"{'probe':<30} {'result':<11} en")
    print("-" * 100)
    for label, method, path, body, must in PROBES:
        _, zh_body = call(base, method, path, body, "zh")
        _, en_body = call(base, method, path, body, "en")
        zh_text, en_text = message_of(zh_body), message_of(en_body)

        if not CJK.search(zh_text):
            # Nothing Chinese to translate -- typically a raw stdlib exception
            # such as json.JSONDecodeError, which is already English.
            verdict = "language-neutral"
        elif zh_text == en_text:
            verdict = "unchanged"
        elif CJK.search(en_text):
            verdict = "still-CJK"
        else:
            verdict = "localised"

        shown = en_text.replace("\n", " ")[:56]
        print(f"{label:<30} {verdict:<17} {shown}")
        if verdict == "unchanged":
            unchanged.append(label)
        if must and verdict in ("unchanged", "still-CJK"):
            failures.append(f"{label} should be localised but was '{verdict}': {en_text!r}")

    print()
    if unchanged:
        print(f"not in the catalogue (may be intentional): {', '.join(unchanged)}")
    if failures:
        print("\nFAILED:")
        for item in failures:
            print("  - " + item)
        return 1
    print(f"PASS: all {len(PROBES)} probes answered consistently between locales")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
