"""Locks the JS <-> Python coupling around option values.

The WebUI submits option VALUES that `assistant_rules/engine.py` compares against
with ==. Those values are Chinese strings ('中文', '标准 / Standard', ...). They
are deliberately NOT translated -- only their visible labels are -- because
changing them would break validation and invalidate saved drafts.

That decision is easy to undo by accident: translating just one option value, or
typo'ing a value in the label map, reintroduces the bug silently (the label just
stops translating, or the server rejects the request). These tests fail loudly
instead, and they read the real files rather than restating the values.
"""
import re
import unittest
from pathlib import Path

from app.yue2_app.assistant_rules import engine

WEB = Path(__file__).resolve().parents[1] / "app" / "web"

# `  '中文': 'assistant.option.chinese',` inside OPTION_LABELS in assistant.js
OPTION_ENTRY = re.compile(r"^\s{2}'([^']+)':\s*'(assistant\.option\.[A-Za-z0-9_.]+)',", re.MULTILINE)
# `'assistant.option.chinese': 'Chinese',` inside a dictionary file
DICT_ENTRY = re.compile(r"^\s{2}'(assistant\.option\.[A-Za-z0-9_.]+)':\s*'", re.MULTILINE)


def option_map() -> dict:
    """value -> label key, as assistant.js declares it."""
    text = (WEB / "assistant.js").read_text(encoding="utf-8")
    start = text.find("const OPTION_LABELS = {")
    end = text.find("};", start)
    return dict(OPTION_ENTRY.findall(text[start:end]))


def dictionary_keys() -> dict:
    text = (WEB / "i18n.assistant.js").read_text(encoding="utf-8")
    result = {}
    for locale in ("zh", "en"):
        marker = f"registerLocale('{locale}', {{"
        block = text[text.find(marker):text.find("\n});", text.find(marker))]
        result[locale] = set(DICT_ENTRY.findall(block))
    return result


class OptionValueCouplingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mapping = option_map()

    def test_every_mapped_value_is_one_the_engine_accepts(self):
        accepted = set(engine.LYRIC_MODES) | {engine.STANDARD, engine.REVIEW,
                                             engine.ABC_KEEP, engine.ABC_STRIP,
                                             engine.ABC_GENERATE, engine.ABC_DOWNSTREAM,
                                             "中文", "English", "日本語", "한국어"}
        unknown = {value: key for value, key in self.mapping.items() if value not in accepted}
        self.assertEqual(unknown, {},
                         f"assistant.js maps values the engine does not accept: {unknown}")

    def test_every_label_key_exists_in_both_locales(self):
        keys = dictionary_keys()
        missing = {}
        for value, key in self.mapping.items():
            for locale in ("zh", "en"):
                if key not in keys[locale]:
                    missing.setdefault(locale, []).append(f"{value!r} -> {key}")
        self.assertEqual(missing, {}, f"option label keys missing from the dictionary: {missing}")

    def test_every_engine_language_is_offered_by_the_ui(self):
        # The four languages engine.py accepts must all be reachable, or a user
        # simply cannot generate in one of them.
        expected = {"中文", "English", "日本語", "한국어"}
        offered = expected & set(self.mapping)
        self.assertEqual(offered, expected,
                         f"languages the engine accepts but the UI cannot send: {expected - offered}")

    def test_lyric_modes_are_all_offered(self):
        offered = set(engine.LYRIC_MODES) & set(self.mapping)
        self.assertEqual(offered, set(engine.LYRIC_MODES),
                         f"lyric modes not mapped: {set(engine.LYRIC_MODES) - offered}")

    def test_index_html_option_values_match_the_engine(self):
        """The static lyrics-language select must submit engine-accepted values.

        Reads the submitted value -- the `value` attribute when present, else the
        option text, since the two started out identical.
        """
        html = (WEB / "index.html").read_text(encoding="utf-8")
        select = re.search(r'<select[^>]*name="lyrics_language".*?</select>', html, re.S)
        self.assertIsNotNone(select, "lyrics_language select not found in index.html")
        options = re.findall(r"<option([^>]*)>([^<]*)</option>", select.group(0))
        submitted = set()
        for attributes, text in options:
            found = re.search(r'value="([^"]*)"', attributes)
            submitted.add(found.group(1) if found else text.strip())
        self.assertEqual(submitted, {"中文", "English", "日本語", "한국어"},
                         f"lyrics_language submits {submitted}, which the engine would reject")

    def test_engine_still_understands_every_language_value(self):
        """Proves the validation path itself still works with these values.

        `language_mismatch` is where the lyrics-language value is actually
        compared, so exercising it for each option is a direct check that
        localising the labels did not disturb what the engine receives.
        """
        samples = {"中文": "晚风穿过城市的灯", "English": "Neon fades along the lane",
                   "日本語": "夜風が街を抜ける", "한국어": "밤바람이 불어와"}
        for language, lyrics in samples.items():
            with self.subTest(language=language):
                self.assertFalse(engine.language_mismatch(lyrics, language),
                                 f"engine rejected its own lyrics for {language!r}")
                # And the cross-language case must still be caught.
                other = next(code for code in samples if code != language)
                self.assertTrue(engine.language_mismatch(samples[other], language))

    def test_translated_labels_differ_from_their_values_in_english(self):
        """The English label must not be the Chinese protocol value.

        If it were, the dropdown would still read Chinese in English mode --
        exactly the bug this mapping exists to fix.
        """
        text = (WEB / "i18n.assistant.js").read_text(encoding="utf-8")
        block = text[text.find("registerLocale('en', {"):]
        offenders = []
        for value, key in self.mapping.items():
            found = re.search(r"'%s':\s*'([^']*)'" % re.escape(key), block)
            if found and found.group(1) == value and re.search(r"[\u4e00-\u9fff]", value):
                offenders.append(f"{value!r} -> {key} is untranslated")
        # 'English' is the same word in both locales and is not Chinese, so it is
        # naturally exempt; only Chinese values must change.
        self.assertEqual(offenders, [], f"option labels not translated: {offenders}")


if __name__ == "__main__":
    unittest.main()
