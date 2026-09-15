"""Every job-summary key the server emits must exist in the browser dictionary.

A job summary is produced once, in Python, when the job is queued and is stored
with it -- so the stored string is frozen in whatever language was active then.
The server therefore also sends a locale-neutral `summary_key` plus params, and
app.js renders that instead.

If the two sides ever drift, the failure is ugly and silent-ish: app.js calls
t(key) for a key the dictionary does not have, and the job card displays the raw
key text ("summary.stage.plan"). This test walks every branch of the server's
_summary_spec and asserts the resulting keys are all present, in both locales.
"""
import re
import unittest
from pathlib import Path

from app.yue2_app.service import JobStore

WEB = Path(__file__).resolve().parents[1] / "app" / "web"
KEY_LITERAL = re.compile(r"'(summary\.[A-Za-z0-9_.]+)':\s*'")

# One request per branch of JobStore._summary_spec. Keys are collected by running
# the real function, not by parsing its source, so a new branch is covered as
# soon as it is added here.
CASES = (
    ("assistant", {"test_connection": True}),
    ("assistant", {"values": {}}),
    ("assistant", {"values": {"music_idea": "anything"}}),
    ("doctor", {}),
    ("transcribe", {}),
    ("transcribe", {"source_path": "C:/a/b/song.flac"}),
    ("voice_convert", {}),
    ("reference_cover", {"reference_path": "C:/a/voice.wav"}),
    ("render_plan", {}),
    ("plan", {}),
    ("semantic", {}),
    ("synthesize", {}),
    ("decode", {}),
    ("some_unknown_kind", {}),
)


def emitted_keys() -> set:
    keys = set()
    for kind, request in CASES:
        spec = JobStore._summary_spec(kind, request)
        if spec.get("key"):
            keys.add(spec["key"])
    return keys


def dictionary_keys(locale: str) -> set:
    text = (WEB / "i18n.app.js").read_text(encoding="utf-8")
    marker = f"registerLocale('{locale}', {{"
    start = text.find(marker)
    end = text.find("\n});", start)
    return set(KEY_LITERAL.findall(text[start:end]))


class SummaryKeyParityTests(unittest.TestCase):
    def test_server_emits_at_least_one_key_per_shape(self):
        # Guards this test itself: if the cases stopped exercising the server,
        # the parity assertions below would pass vacuously.
        self.assertGreaterEqual(len(emitted_keys()), 12)

    def test_every_emitted_key_is_defined_in_both_locales(self):
        emitted = emitted_keys()
        for locale in ("zh", "en"):
            missing = sorted(emitted - dictionary_keys(locale))
            self.assertEqual(missing, [],
                             f"summary keys emitted by the server but missing from "
                             f"the '{locale}' dictionary: {missing}")

    def test_no_dead_summary_keys_in_the_dictionary(self):
        emitted = emitted_keys()
        for locale in ("zh", "en"):
            dead = sorted(dictionary_keys(locale) - emitted)
            self.assertEqual(dead, [],
                             f"'{locale}' defines summary keys the server never "
                             f"emits: {dead}")

    def test_user_supplied_summaries_carry_no_key(self):
        # A style prompt is user data; it must be rendered verbatim, never
        # looked up as a translation key.
        spec = JobStore._summary_spec("generate", {"style": "Mandarin pop"})
        self.assertIsNone(spec["key"])
        self.assertEqual(spec["text"], "Mandarin pop")

    def test_placeholder_names_match_between_locales(self):
        text = (WEB / "i18n.app.js").read_text(encoding="utf-8")
        for key in sorted(emitted_keys()):
            names = {}
            for locale in ("zh", "en"):
                marker = f"registerLocale('{locale}', {{"
                start = text.find(marker)
                end = text.find("\n});", start)
                found = re.search(r"'%s':\s*'([^']*)'" % re.escape(key), text[start:end])
                if found:
                    names[locale] = set(re.findall(r"\{(\w+)\}", found.group(1)))
            self.assertEqual(names.get("zh"), names.get("en"),
                             f"placeholder mismatch for {key}: {names}")


if __name__ == "__main__":
    unittest.main()
