# Manual test checklist (run it yourself in the WebUI or from the command line)

> Start: double-click `D:\YuE2\T8\start_rocm.bat` → browser at `http://127.0.0.1:8189`
> (if the service is already running, don't start it again; it will say "a service instance is already running" — that is the normal single-instance lock)

---

## A. Song generation (the core feature; test this first)

| # | What to test | How to test | Expected |
|---|---|---|---|
| A1 | Chinese short song | WebUI: keep the default template and click "Generate Full Song" | A 1–2 minute song; clear vocals on playback, no noise |
| A2 | **Song length is driven by the lyrics** | Add lyrics until you have 4 or more sections, then generate | Clearly longer (about 5.7 s per line) |
| A3 | Chinese vs. English | Switch `style` between `Mandarin` ↔ `English` | Both sing; the language tag takes effect |
| A4 | **Editable score** (a YuE2 specialty) | After generating, copy the contents of `score.abc` and change a few notes → tick "Render with edited score" → generate again | It sings the edited melody |
| A5 | Style switching | Change style to metal / jazz / Chinese traditional, etc. | The genre clearly changes |
| A6 | Command-line song generation | `D:\YuE2\run_yue2.bat outputs\test_cli` | Generates a song the same way (goes through the official CLI, independent of the WebUI) |

Reference requests: `D:\YuE2\zh_song.json` (Chinese, 2:55), `D:\YuE2\long_song.json` (English, 2:51)

## B. Audio-to-score transcription + score rendering

| # | What to test | How to test | Expected |
|---|---|---|---|
| B1 | Transcribe a generated song | In the WebUI, upload `D:\YuE2\outputs\zh_demo01\audio.flac` → transcribe | You get ABC + a **PDF score** + piano playback WAV |
| B2 | Transcribe a **real recording** (more convincing) | Any mp3 under 30s → transcribe | The main melody is extracted; dense arrangements may be inaccurate (melody_only mode) |
| B3 | Open the PDF | Open `score.pdf` in a browser/reader | Staff notation renders correctly (playwright+abcjs) |

## C. Reference-timbre covers

| # | What to test | How to test | Expected |
|---|---|---|---|
| C1 | Timbre swap | Source = a generated song; reference = 5–25s of clean dry vocals (record your own or use a clip from a generated song) | Output audio.flac: the melody is preserved and the timbre becomes the reference singer's |
| C2 | Effect of reference quality | Try again with a reverberant/noisy reference | Timbre similarity drops (which shows that reference quality matters) |
| C3 | diffusion_steps | Default is 30; run 8 first for a quick look, then run 30 to compare | More steps means a closer match |

> Reference audio needed for section C: **1–30 seconds of clean dry vocals**. You can use `D:\YuE2\outputs\smoke01\audio.flac` directly (24s).

## D. Edge cases / stress

| # | What to test | Expected |
|---|---|---|
| D1 | A 4-minute song (about 40 lyric lines) | It works, in about 9 minutes; confirms the 0.04s/token rule |
| D2 | Several generations in a row | VRAM is released properly (each job is its own process) |
| D3 | VRAM usage | Check GPU dedicated memory in Task Manager; the peak is about 11–12GB |

---

## On "Advanced Settings → VRAM budget"

**Leave it at the default 23.5; don't change it to 15.5.** It is not actual usage but a per-process cap, and it gets clamped automatically:

| Value entered | Effective cap |
|---|---|
| 23.5 (default) | 13.92 GiB (= 15.92 on this card − 2) |
| 15.5 | 13.5 GiB ← actually lower, zero benefit |

Measured peak usage is only 11–12 GB. The value that really decides speed, `vae_core_frames`, has already
been set automatically to 512 by Patch 2 based on VRAM (upstream's default of 1024 is 2.3× slower on this
card), independently of this budget value.

---

## Known-benign behaviors (not bugs)

| Symptom | Cause |
|---|---|
| The first generation/transcription looks unresponsive for 1–2 minutes | One-off MIOpen solver tuning + model loading |
| Lots of `MIOpen(HIP): Warning ... workspace` lines in the log | Benign warnings that don't affect results |
| Exit code 1 when generating with `--backend torch` | A crash during teardown, but **the artifacts are already fully written** (result.json says complete) |
| Starting again after stopping the service reports "an instance is already running" | Single-instance lock; run `stop_service.bat` first, or end the python process |
| Transcription is slower than expected | SheetSage2+MERT take about 10s to load, plus encoding; longer audio is slower |
| Voice conversion is slow overall | MIOpen is disabled (see the port report §3 Patch 5), so conv uses native PyTorch implementations |

## When things go wrong

1. Logs: `D:\YuE2\T8\logs\<job id>.log` (also reachable from the job details in the WebUI)
2. Service logs: `D:\YuE2\T8\logs\service.stderr.log`
3. Technical details: `D:\YuE2\PROGRESS.md`, `D:\YuE2\DEPLOY_NOTES.md`, `D:\YuE2\_probe_scripts\README_ROCM_PORT.md`
4. **Don't enable `quantization=fp8`** (it silently produces garbage audio); **don't touch the three Python directories under `runtime\`**

---

## Record these after testing (for release material and doc calibration)

- [ ] Time and listening impression for each song (1–5 score)
- [ ] Whether the Chinese diction is clear (this decides whether to bring up "Chinese-language results" in the video)
- [ ] Transcription accuracy (real recordings vs. generated songs)
- [ ] Voice-conversion similarity (same-source reference vs. a different speaker's reference)
- [ ] Actual peak VRAM
