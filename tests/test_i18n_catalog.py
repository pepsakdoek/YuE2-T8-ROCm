"""Guards for the server-side i18n catalogue.

The catalogue is keyed by source string, so its main failure mode is silent
drift: someone rewords a Chinese message and the English silently disappears.
These tests make that loud, and they also fence off the two ways this kind of
change goes wrong -- translating an LLM prompt (changes model behaviour) or
translating a protocol value (breaks validation).
"""
import re
import unittest
from pathlib import Path

from app.yue2_app import i18n
from app.yue2_app.i18n_catalog import EXACT, PATTERNS

APP = Path(__file__).resolve().parents[1] / "app" / "yue2_app"

# Files that legitimately hold the Chinese source text without being callers.
CATALOG_FILES = {"i18n.py", "i18n_catalog.py"}

CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")

# Values that are compared with == or sent to the backend. Translating any of
# these silently breaks assistant_rules/engine.py validation, so they must never
# appear as catalogue keys.
PROTOCOL_VALUES = {"中文", "English", "日本語", "한국어"}


def source_text() -> str:
    parts = []
    for path in sorted(APP.rglob("*.py")):
        if path.name in CATALOG_FILES:
            continue
        parts.append(path.read_text(encoding="utf-8", errors="replace"))
    return "\n".join(parts)


class CatalogueDriftTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = source_text()

    def test_every_exact_key_still_exists_in_the_source(self):
        missing = [key for key in EXACT["en"] if key not in self.source]
        self.assertEqual(
            missing, [],
            "catalogue entries no longer found in the source tree (message reworded?): "
            + "; ".join(missing))

    def test_pattern_literal_prefixes_still_exist_in_the_source(self):
        missing = []
        for pattern, _ in PATTERNS["en"]:
            # Compare the literal run before the first capture group, with the
            # regex escapes removed.
            prefix = pattern.split("(")[0]
            literal = re.sub(r"\\(.)", r"\1", prefix)
            if literal and literal not in self.source:
                missing.append(literal)
        self.assertEqual(missing, [], f"pattern prefixes not found in source: {missing}")


class CatalogueContentTests(unittest.TestCase):
    def test_english_values_contain_no_chinese(self):
        offenders = [key for key, value in EXACT["en"].items() if CJK.search(value)]
        self.assertEqual(offenders, [], f"untranslated English values: {offenders}")

    def test_replacements_contain_no_chinese(self):
        offenders = [repl for _, repl in PATTERNS["en"] if CJK.search(repl)]
        self.assertEqual(offenders, [], f"untranslated pattern replacements: {offenders}")

    def test_protocol_values_are_never_translated(self):
        offenders = set(EXACT["en"]) & PROTOCOL_VALUES
        self.assertEqual(offenders, set(),
                         f"protocol values must not be in the catalogue: {offenders}")

    def test_no_llm_prompt_text_is_translated(self):
        # Prompt text is long, multi-line and lives in engine.py / assistant_data.py.
        # A short catalogue key cannot be prompt text, so flag suspicious entries.
        suspicious = [key for key in EXACT["en"] if len(key) > 120 or "\n" in key]
        self.assertEqual(suspicious, [], f"entries look like prompt text: {suspicious}")

    def test_patterns_compile_and_have_group_references_that_exist(self):
        for pattern, replacement in PATTERNS["en"]:
            compiled = re.compile(pattern)
            groups = compiled.groups
            for reference in re.findall(r"\\(\d)", replacement):
                self.assertLessEqual(int(reference), groups,
                                     f"replacement references group {reference} but "
                                     f"pattern has {groups}: {pattern}")

    def test_every_pattern_actually_fires(self):
        """Build a concrete message from each pattern and translate it.

        The sample must be produced by replacing the group constructs and then
        unescaping the remaining regex escapes -- using the raw pattern text as
        the input would leave literal backslashes in it and never match.
        """
        for pattern, _ in PATTERNS["en"]:
            sample = re.sub(r"\\(.)", r"\1",
                            pattern.replace("(.+)", "SAMPLE").replace(r"(\d+)", "7"))
            self.assertTrue(re.compile(pattern).fullmatch(sample),
                            f"pattern does not match its own sample: {pattern!r} vs {sample!r}")
            rendered = i18n.translate(sample, "en")
            self.assertNotEqual(rendered, sample,
                                f"pattern did not fire for {sample!r}")

    def test_pattern_matching_carries_values_through(self):
        self.assertEqual(i18n.translate("文件大小必须在 12GB 以内", "en"),
                         "File size must be within 12 GB")


class LocalizePayloadTests(unittest.TestCase):
    """The response walker is the only place server prose is translated."""

    def setUp(self):
        from app.yue2_app.service import localize_payload
        self.localize = localize_payload

    def test_error_and_message_are_translated(self):
        payload = {"error": "无效的任务 ID", "message": "正在下载并校验更新包", "status": "failed"}
        result = self.localize(payload, "en")
        self.assertEqual(result["error"], "Invalid job ID")
        self.assertEqual(result["message"], "Downloading and verifying the update package")
        self.assertEqual(result["status"], "failed", "non-prose fields must pass through")

    def test_chinese_locale_is_untouched(self):
        payload = {"error": "无效的任务 ID"}
        self.assertEqual(self.localize(payload, "zh"), payload)

    def test_nested_structures_are_walked(self):
        payload = {"job": {"error": "无效的任务 ID"}, "jobs": [{"error": "文件不存在"}]}
        result = self.localize(payload, "en")
        self.assertEqual(result["job"]["error"], "Invalid job ID")
        self.assertEqual(result["jobs"][0]["error"], "File not found")

    def test_warning_lists_are_translated(self):
        payload = {"warnings": ["文件不存在", "not a catalogue string"], "ok": True}
        result = self.localize(payload, "en")
        self.assertEqual(result["warnings"], ["File not found", "not a catalogue string"])
        self.assertTrue(result["ok"])

    def test_error_lists_and_deep_values_are_handled(self):
        payload = {"errors": ["文件不存在"], "detail": {"errors": ["文件不存在"]}}
        result = self.localize(payload, "en")
        self.assertEqual(result["errors"], ["File not found"])
        self.assertEqual(result["detail"]["errors"], ["File not found"])

    def test_user_data_is_never_translated(self):
        payload = {"summary": "参考音色翻唱", "error": "Mandarin pop, warm piano"}
        result = self.localize(payload, "en")
        # summary is rendered by the client from summary_key, and a style prompt
        # that merely resembles nothing in the catalogue stays put.
        self.assertEqual(result["summary"], "参考音色翻唱")
        self.assertEqual(result["error"], "Mandarin pop, warm piano")

    def test_non_string_values_are_safe(self):
        payload = {"error": None, "warnings": [], "message": 7}
        self.assertEqual(self.localize(payload, "en"), payload)


class TranslateTests(unittest.TestCase):
    def test_exact_match(self):
        self.assertEqual(i18n.translate("无效的任务 ID", "en"), "Invalid job ID")

    def test_pattern_match_preserves_values(self):
        self.assertEqual(i18n.translate("不支持的任务类型：banana", "en"),
                         "Unsupported job kind: banana")
        self.assertEqual(i18n.translate("任务运行失败（worker 返回码 3）", "en"),
                         "Job failed (worker exit code 3)")

    def test_unknown_string_passes_through(self):
        self.assertEqual(i18n.translate("一些没人翻译过的中文", "en"), "一些没人翻译过的中文")

    def test_chinese_locale_is_identity(self):
        self.assertEqual(i18n.translate("无效的任务 ID", "zh"), "无效的任务 ID")
        self.assertEqual(i18n.translate("无效的任务 ID", i18n.DEFAULT_LOCALE), "无效的任务 ID")

    def test_non_strings_pass_through(self):
        for value in (None, 3, [], {}, b"bytes"):
            self.assertEqual(i18n.translate(value, "en"), value)

    def test_user_data_is_not_translated(self):
        # A style prompt that merely resembles nothing in the catalogue stays put.
        self.assertEqual(i18n.translate("Mandarin pop, warm piano", "en"),
                         "Mandarin pop, warm piano")


class ResolveLocaleTests(unittest.TestCase):
    def test_missing_or_blank_defaults_to_chinese(self):
        for value in (None, "", "   "):
            self.assertEqual(i18n.resolve_locale(value), "zh", repr(value))

    def test_english_tags(self):
        for value in ("en", "EN", "en-US", "en-GB,en;q=0.9"):
            self.assertEqual(i18n.resolve_locale(value), "en", repr(value))

    def test_chinese_tags(self):
        for value in ("zh", "zh-CN", "zh-Hans", "zh-TW,zh;q=0.9"):
            self.assertEqual(i18n.resolve_locale(value), "zh", repr(value))

    def test_unknown_tags_fall_back_to_chinese(self):
        for value in ("fr", "de-DE", "ru"):
            self.assertEqual(i18n.resolve_locale(value), "zh", repr(value))

    def test_browser_style_semicolon_list_is_handled(self):
        self.assertEqual(i18n.resolve_locale("en-US;q=0.9,zh-CN;q=0.8"), "en")


if __name__ == "__main__":
    unittest.main()
