"""Dev helper: verify the i18n catalogue against the source tree.

Checks, by construction rather than by eye:
  1. every EXACT key still occurs verbatim in app/yue2_app/**/*.py;
  2. every pattern's literal prefix occurs in the source tree;
  3. no English value / replacement contains CJK;
  4. every pattern full-matches its own generated sample and actually fires;
  5. coverage: every CJK-bearing source string is rendered into a concrete
     message and translated, so "covered" means i18n.translate really changes it.
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "yue2_app"
sys.path.insert(0, str(ROOT))

from app.yue2_app import i18n  # noqa: E402
from app.yue2_app.i18n_catalog import EXACT, PATTERNS  # noqa: E402

CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
PLACEHOLDER = re.compile(r"\{[^{}]*\}")
SKIP_FILES = {"i18n.py", "i18n_catalog.py"}


def source_files():
    for path in sorted(APP.rglob("*.py")):
        if path.name not in SKIP_FILES:
            yield path


def source_text() -> str:
    return "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in source_files())


class Collector(ast.NodeVisitor):
    """Collect CJK-bearing str constants and f-strings, without double-counting
    the constant parts of an f-string as separate messages."""

    def __init__(self):
        self.items = []

    def visit_Constant(self, node):  # noqa: N802
        if isinstance(node.value, str) and CJK.search(node.value):
            self.items.append(node.value)

    def visit_JoinedStr(self, node):  # noqa: N802
        chunks = []
        for part in node.values:
            if isinstance(part, ast.Constant):
                chunks.append(str(part.value))
            else:
                chunks.append("{" + ast.unparse(part.value) + "}")
        text = "".join(chunks)
        if CJK.search(text):
            self.items.append(text)
        # Do not descend: the constant parts are fragments, not messages.


def literals_per_file():
    out = {}
    for path in source_files():
        tree = ast.parse(path.read_text(encoding="utf-8"))
        collector = Collector()
        collector.visit(tree)
        if collector.items:
            out[path.relative_to(APP).as_posix()] = collector.items
    return out


def samples(text: str):
    """Concrete messages for a source form: raw, and with placeholders filled."""
    yield text
    yield PLACEHOLDER.sub("X", text)
    yield PLACEHOLDER.sub("7", text)


def covered(text: str) -> bool:
    for sample in samples(text):
        if i18n.translate(sample, "en") != sample:
            return True
    return False


def main() -> int:
    source = source_text()
    exact = EXACT["en"]
    problems = []

    missing = [key for key in exact if key not in source]
    if missing:
        problems.append(f"EXACT keys not found in source: {missing}")

    for pattern, _ in PATTERNS["en"]:
        literal = re.sub(r"\\(.)", r"\1", pattern.split("(")[0])
        if literal and literal not in source:
            problems.append(f"pattern prefix not found in source: {literal!r}")

    problems += [f"EXACT value has CJK: {key}" for key, value in exact.items() if CJK.search(value)]
    problems += [f"replacement has CJK: {repl!r}" for _, repl in PATTERNS["en"] if CJK.search(repl)]
    problems += [f"EXACT key too long / multiline (prompt-shaped): {key!r}"
                 for key in exact if len(key) > 120 or "\n" in key]

    for pattern, _ in PATTERNS["en"]:
        compiled = re.compile(pattern)
        sample = re.sub(r"\\(.)", r"\1",
                        pattern.replace("(.+)", "SAMPLE").replace(r"(\d+)", "7"))
        if not compiled.fullmatch(sample):
            problems.append(f"pattern does not match its own sample: {pattern!r} vs {sample!r}")
            continue
        if i18n.translate(sample, "en") == sample:
            problems.append(f"pattern did not fire: {pattern!r}")
        groups = compiled.groups
        for repl in [r for p, r in PATTERNS["en"] if p == pattern]:
            for ref in re.findall(r"\\(\d)", repl):
                if int(ref) > groups:
                    problems.append(f"replacement references group {ref} of {groups}: {pattern!r}")

    print(f"EXACT entries: {len(exact)}   patterns: {len(PATTERNS['en'])}\n")
    print(f"{'module':<32} {'cjk':>4} {'covered':>8} {'missed':>7}")
    totals = [0, 0, 0]
    missed_all = {}
    for name, items in literals_per_file().items():
        hit = [item for item in items if covered(item)]
        missed = [item for item in items if item not in hit]
        missed_all[name] = missed
        totals[0] += len(items)
        totals[1] += len(hit)
        totals[2] += len(missed)
        print(f"{name:<32} {len(items):>4} {len(hit):>8} {len(missed):>7}")
    print(f"{'TOTAL':<32} {totals[0]:>4} {totals[1]:>8} {totals[2]:>7}")
    pct = 100.0 * totals[1] / max(1, totals[0])
    print(f"coverage: {pct:.1f}%")

    print("\n--- source strings that do NOT translate (must be excluded on purpose) ---")
    for name, items in missed_all.items():
        for item in items:
            print(f"{name}: {item.replace(chr(10), ' ')[:160]}")

    print("\n--- problems ---")
    for problem in problems:
        print("!", problem)
    print("OK" if not problems else f"{len(problems)} PROBLEM(S)")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
