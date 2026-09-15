"""Run the kit's unittest suite without pytest.

The tests are unittest-style but `tests/` is not a package and there is no
pytest in the ROCm runtime, so `unittest discover` refuses the directory. This
loads each test_*.py by path with the kit root on sys.path.
"""
import importlib.util
import sys
import traceback
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

loader = unittest.TestLoader()
suite = unittest.TestSuite()
skipped = []

for path in sorted((ROOT / "tests").glob("test_*.py")):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[path.stem] = module
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        skipped.append((path.name, f"{type(exc).__name__}: {exc}"))
        continue
    suite.addTests(loader.loadTestsFromModule(module))

print(f"loaded {suite.countTestCases()} tests from "
      f"{len(list((ROOT / 'tests').glob('test_*.py'))) - len(skipped)} modules")
for name, reason in skipped:
    print(f"  SKIPPED IMPORT {name}: {reason}")
print()

result = unittest.TextTestRunner(verbosity=1).run(suite)

if result.failures:
    print("\n=== FAILURES ===")
    for case, text in result.failures:
        print(f"\n--- {case}")
        print(text.strip().splitlines()[-1] if text.strip() else "")
if result.errors:
    print("\n=== ERRORS ===")
    for case, text in result.errors:
        print(f"\n--- {case}")
        print("\n".join(text.strip().splitlines()[-8:]))

print(f"\nrun={result.testsRun} failures={len(result.failures)} "
      f"errors={len(result.errors)} skipped={len(result.skipped)}")
raise SystemExit(0 if result.wasSuccessful() else 1)
