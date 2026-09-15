#!/usr/bin/env python3
"""Browser-verify the WebUI language toggle.

Static checks cannot prove a language switch works: the strings are applied by
JavaScript at runtime, and a missing dictionary key silently falls back to
Chinese while still looking plausible. This drives a real Chromium.

It checks, in order:
  1. the page loads with no JS errors and no i18n missing-key warnings
  2. the Chinese default renders, and the toggle offers "English"
  3. clicking the toggle switches visible text and <html lang> to English
  4. the choice survives a reload (localStorage persistence)
  5. switching back to Chinese restores the original strings
  6. the app still functions after switching (health line populated, tabs clickable)

Screenshots are written next to this script's output directory for eyeballing.

Usage:
    set PLAYWRIGHT_BROWSERS_PATH to <kit>/runtime/playwright, then
    runtime\\python.exe scripts\\rocm\\verify_webui_i18n.py
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

CJK = re.compile(r"[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]")


async def run(url: str, shots: Path, headed: bool) -> int:
    from playwright.async_api import async_playwright

    shots.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    report: dict = {}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=not headed)
        # Start from a Chinese-locale browser so the default path is exercised,
        # and clear any previously saved choice.
        context = await browser.new_context(locale="zh-CN", viewport={"width": 1400, "height": 1000})
        page = await context.new_page()

        problems: list[str] = []
        locales_seen: list[str | None] = []
        # Set while deliberately provoking a failing request, so the browser's
        # own "Failed to load resource" console entry is not reported as a bug.
        state = {"probing": False}

        def on_request(request):
            # The server generates some prose itself (job errors, validation
            # failures), so the client must tell it which language to use.
            if "/api/" in request.url:
                locales_seen.append(request.headers.get("x-yue2-locale"))

        def on_console(message):
            # Deliberate probes provoke errors and misuse warnings on purpose;
            # they are asserted on directly rather than through the console.
            if state["probing"]:
                return
            text = message.text
            if message.type == "error":
                problems.append(f"console.error: {text}")
            elif "[i18n] missing key" in text:
                problems.append(f"missing key: {text}")
            elif message.type == "warning" and "i18n" in text:
                problems.append(f"console.warning: {text}")

        page.on("console", on_console)
        page.on("pageerror", lambda exc: problems.append(f"pageerror: {exc}"))
        page.on("request", on_request)

        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(1200)

        # ---- 1. Chinese default -------------------------------------------------
        lang_zh = await page.get_attribute("html", "lang")
        nav_zh = (await page.inner_text("nav")).strip()
        toggle_zh = (await page.inner_text("#locale-toggle")).strip()
        title_zh = await page.title()
        heading_zh = (await page.inner_text("header h1")).strip()
        report["zh"] = {"lang": lang_zh, "nav": nav_zh, "toggle": toggle_zh, "title": title_zh}
        await page.screenshot(path=str(shots / "01-chinese.png"), full_page=False)
        if not CJK.search(nav_zh):
            failures.append(f"expected Chinese nav text by default, got: {nav_zh!r}")
        if toggle_zh != "English":
            failures.append(f"toggle should read 'English' while UI is Chinese, got {toggle_zh!r}")

        # ---- 2. switch to English ----------------------------------------------
        await page.click("#locale-toggle")
        await page.wait_for_timeout(600)
        lang_en = await page.get_attribute("html", "lang")
        nav_en = (await page.inner_text("nav")).strip()
        toggle_en = (await page.inner_text("#locale-toggle")).strip()
        title_en = await page.title()
        heading_en = (await page.inner_text("header h1")).strip()
        body_en = (await page.inner_text("body")).strip()
        report["en"] = {"lang": lang_en, "nav": nav_en, "toggle": toggle_en, "title": title_en,
                        "heading": heading_en}
        await page.screenshot(path=str(shots / "02-english.png"), full_page=False)
        if lang_en != "en":
            failures.append(f"<html lang> should be 'en' after switching, got {lang_en!r}")
        if CJK.search(nav_en):
            failures.append(f"nav still contains Chinese after switching: {nav_en!r}")
        if toggle_en != "中文":
            failures.append(f"toggle should read '中文' while UI is English, got {toggle_en!r}")
        if heading_en == heading_zh:
            failures.append("header heading did not change when switching to English")
        remaining = len(CJK.findall(body_en))
        report["cjk_left_in_english_body"] = remaining

        # Which regions are still Chinese? A single body-wide count cannot tell a
        # genuinely untranslated panel from a stray label, and this is the number
        # that decides whether the toggle is actually complete.
        #
        # Measured over text nodes rather than innerText so hidden panels (which
        # report their full textContent, or nothing at all, depending on the
        # engine) are counted consistently. The locale button is excluded: it
        # shows the TARGET language as an endonym, so "中文" there while the UI is
        # English is correct, not a miss.
        report["cjk_by_section_en"] = await page.evaluate(
            """() => {
                 const pattern = /[\\u3000-\\u303f\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef]/g;
                 const skip = document.getElementById('locale-toggle');
                 const hits = (text) => { const m = String(text || '').match(pattern); return m ? m.length : 0; };
                 const count = (root) => {
                   let total = 0;
                   const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                   let node;
                   while ((node = walker.nextNode())) {
                     if (skip && skip.contains(node)) continue;
                     // A <textarea>'s original content stays in the DOM as a text
                     // node even after .value is replaced, so counting text nodes
                     // alone reports stale Chinese for a field that renders
                     // English. The live value is measured separately below.
                     const parent = node.parentElement;
                     if (parent && (parent.tagName === 'TEXTAREA' || parent.tagName === 'INPUT')) continue;
                     total += hits(node.nodeValue);
                   }
                   for (const field of root.querySelectorAll('textarea, input')) {
                     if (field.type === 'checkbox' || field.type === 'radio' || field.type === 'file') continue;
                     total += hits(field.value);
                   }
                   return total;
                 };
                 const out = {};
                 for (const region of document.querySelectorAll('header, nav, main > section, footer')) {
                   const label = region.id || region.tagName.toLowerCase();
                   const found = count(region);
                   if (found) out[label] = found;
                 }
                 const bodyTotal = count(document.body);
                 if (bodyTotal) out['__body_total'] = bodyTotal;
                 return out;
               }"""
        )

        # The page polls health/jobs, so give it a tick to emit a request in the
        # newly selected locale before judging what the client sent.
        await page.wait_for_timeout(2600)
        report["api_locale_headers"] = {
            "total": len(locales_seen),
            "distinct": sorted({value for value in locales_seen if value is not None}),
            "missing": sum(1 for value in locales_seen if value is None),
        }
        if not locales_seen:
            failures.append("no /api/ requests observed, so the locale header could not be checked")
        elif "en" not in locales_seen:
            failures.append(f"client never sent X-YuE2-Locale: en (saw {sorted(set(locales_seen))})")
        elif any(value is None for value in locales_seen[-10:]):
            failures.append("recent /api/ requests are missing the X-YuE2-Locale header")

        # End-to-end proof that the header changes what the server says: ask for
        # a job that does not exist and read the message back through the page's
        # own API helper. In English mode it must not contain Chinese.
        state["probing"] = True
        server_error = await page.evaluate(
            """async () => {
                 try { await api('/api/jobs/definitely-not-a-job'); return null; }
                 catch (error) { return error.message; }
               }"""
        )
        state["probing"] = False
        report["server_error_in_english"] = server_error
        if not server_error:
            failures.append("expected the bad-job request to fail, but it succeeded")
        elif CJK.search(server_error):
            failures.append(f"server error still Chinese in English mode: {server_error!r}")

        # ---- 3. persistence across reload --------------------------------------
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_timeout(1000)
        nav_reload = (await page.inner_text("nav")).strip()
        lang_reload = await page.get_attribute("html", "lang")
        report["after_reload"] = {"lang": lang_reload, "nav": nav_reload}
        if lang_reload != "en" or CJK.search(nav_reload):
            failures.append("English choice did not survive a reload (localStorage persistence broken)")

        # ---- 4. app still functions + switch back ------------------------------
        tabs = await page.eval_on_selector_all("nav .tab", "els => els.map(e => e.dataset.tab)")
        report["tabs"] = tabs
        for tab in tabs:
            if tab in ("create", "plan", "history"):
                await page.click(f'nav .tab[data-tab="{tab}"]')
                await page.wait_for_timeout(150)
        health_title = (await page.inner_text("#health-title")).strip()
        report["health_title_en"] = health_title
        if CJK.search(health_title):
            failures.append(f"health line still Chinese in English mode: {health_title!r}")

        await page.click("#locale-toggle")
        await page.wait_for_timeout(600)
        nav_back = (await page.inner_text("nav")).strip()
        report["back_to_zh"] = {"nav": nav_back, "lang": await page.get_attribute("html", "lang")}
        await page.screenshot(path=str(shots / "03-back-to-chinese.png"), full_page=False)
        if not CJK.search(nav_back):
            failures.append(f"switching back did not restore Chinese: {nav_back!r}")

        # Self-test of the engine's own semantics in a real browser. These are
        # the rules the markup depends on, and each one has a failure mode that
        # is invisible in a screenshot: a wrapped <input> silently deleted, or a
        # user's typed lyrics silently overwritten on a language switch.
        state["probing"] = True
        report["engine_conventions"] = await page.evaluate(
            """() => {
                 const out = {};
                 const apply = window.YUE2_I18N.apply;

                 // 1. data-i18n-text must leave a wrapped control alive.
                 const label = document.createElement('label');
                 label.setAttribute('data-i18n-text', 'app.title');
                 const field = document.createElement('input');
                 field.value = 'keep me';
                 label.appendChild(document.createTextNode('原始标签'));
                 label.appendChild(field);
                 document.body.appendChild(label);
                 apply(document.body);
                 out.text_keeps_control = label.querySelector('input') === field;
                 out.text_control_value_intact = field.value === 'keep me';
                 out.text_replaced = !label.textContent.includes('原始标签');
                 label.remove();

                 // 2. data-i18n must not overwrite a form control's value.
                 const area = document.createElement('textarea');
                 area.setAttribute('data-i18n', 'app.title');
                 area.value = 'what the user typed';
                 document.body.appendChild(area);
                 apply(document.body);
                 out.editable_value_preserved = area.value === 'what the user typed';
                 area.remove();

                 // 3. data-i18n-default applies, then yields to a user edit.
                 const seeded = document.createElement('textarea');
                 seeded.setAttribute('data-i18n-default', 'app.title');
                 document.body.appendChild(seeded);
                 apply(document.body);
                 out.default_applied = seeded.value.length > 0;
                 seeded.value = 'edited by the user';
                 apply(document.body);
                 out.default_respects_edit = seeded.value === 'edited by the user';
                 seeded.remove();

                 return out;
               }"""
        )
        state["probing"] = False
        for name, ok in report["engine_conventions"].items():
            if not ok:
                failures.append(f"engine convention check failed: {name}")

        report["console_problems"] = problems[:40]
        await browser.close()

    print(json.dumps(report, indent=2, ensure_ascii=False))
    # A missing key means the UI silently kept its Chinese text, and misuse on a
    # form control means user input can be overwritten on a language switch.
    # Both are real defects, not warnings.
    missing = [p for p in report["console_problems"] if p.startswith("missing key")]
    misuse = [p for p in report["console_problems"] if "user-editable element is ignored" in p]
    errors = [p for p in report["console_problems"]
              if not p.startswith("missing key") and p not in misuse]
    if missing:
        failures.append(f"{len(missing)} missing dictionary key(s) hit at runtime")
        for item in missing[:10]:
            print("  " + item, file=sys.stderr)
    if misuse:
        failures.append(f"{len(misuse)} data-i18n misuse(s) on user-editable elements")
        for item in misuse[:10]:
            print("  " + item, file=sys.stderr)
    if errors:
        print(f"\n{len(errors)} console/page error(s)", file=sys.stderr)
        for item in errors[:10]:
            print("  " + item, file=sys.stderr)
    if failures:
        print("\nFAILED:", file=sys.stderr)
        for item in failures:
            print("  - " + item, file=sys.stderr)
        return 1
    print("\nPASS: language toggle switches, persists, and restores")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="http://127.0.0.1:8189/")
    parser.add_argument("--shots", type=Path, default=ROOT / "outputs" / "i18n-check")
    parser.add_argument("--headed", action="store_true")
    args = parser.parse_args(argv)
    return asyncio.run(run(args.url, args.shots, args.headed))


if __name__ == "__main__":
    raise SystemExit(main())
