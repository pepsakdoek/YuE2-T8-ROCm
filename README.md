# YuE2-T8-ROCm

**YuE2 music generation on AMD Radeon under native Windows ROCm — no CUDA, no Triton, no flash-attn.**

This is a fork with two layers of change on top of the original project:

1. **[T8mars/Comfyui-YuE2-T8](https://github.com/T8mars/Comfyui-YuE2-T8)** (T8star-Aix) wraps the
   original YuE2 model in a local WebUI and a ComfyUI node pack. Its installer is CUDA-only by
   construction (`--index-url .../whl/cu128`), so it has no install path on an AMD card.
2. **This repository** ports that bundle to AMD Radeon: an AMD TheRock ROCm runtime, four source
   fixes that are device-agnostic rather than AMD-specific, RDNA2 (gfx1030) support, English docs and
   filenames, and an English/Chinese toggle in the WebUI.

The underlying model and CLI are **[multimodal-art-projection/YuE](https://github.com/multimodal-art-projection/YuE)**
(YuE2), whose stated target is Linux + NVIDIA + 24 GB VRAM.

Verified on two machines:

| Machine | GPU | Arch | Status |
|---|---|---|---|
| Author's | Radeon RX 9070 XT 16 GB | gfx1201 / RDNA4 | All four capabilities verified end-to-end |
| Contributor's | Radeon RX 6800 16 GB | gfx1030 / RDNA2 | Song generation verified end-to-end (see [`docs/GFX1030_RX6800.md`](docs/GFX1030_RX6800.md)) |

---

## Requirements

The gate is **not** VRAM — it is whether AMD publishes a Windows ROCm PyTorch wheel for your GPU
family. Everything else is comparatively cheap.

| Requirement | Value | Notes |
|---|---|---|
| GPU | Any family AMD ships Windows ROCm `torch` for | `gfx110X-all`, `gfx120X-all`, `gfx1151`, `gfx94X-dcgpu`, `gfx950-dcgpu`. **RDNA2 (gfx103X) is only published under the `v2-staging` index** — see below |
| VRAM | **7.01 GiB resident floor** measured; 16 GB verified end-to-end | Upstream recommends 24 GB. The code enforces `min(memory_budget_gib − 2, total − 2)` |
| OS + driver | Windows 10/11 x64 + current Adrenalin | Linux works too; it is upstream's own target |
| Python | 3.12 (the installer builds an embedded 3.12.10) | Upstream declares `>=3.10` |
| Disk | **17.7 GB** for runtime + generation models | ~45 GB if you also install the transcription, voice and render models |
| Weights | YuE2-3B (7.26 GB) + YuE2-Vae (0.53 GB) for generation | ~12.2 GB for the full capability set |
| Network | Once, ~18 GB | `python.org`, `rocm.nightlies.amd.com`, `huggingface.co` or `hf-mirror.com` |
| Not needed | CUDA, Triton, flash-attn, ComfyUI | Proven by running on a HIP-only build |

Measured on the RX 6800: a 66.7 s song takes **890 s** end to end (13.35 s per audio second), about
3.3× slower than the RX 9070 XT, because RDNA2 has no hardware BF16 and the two autoregressive
stages run on emulated BF16.

### Picking the right wheel index

`scripts/rocm/setup_rocm_runtime.ps1` defaults to the RDNA4 index. Match it to your card:

| Your GPU | Install command |
|---|---|
| RX 9000 series (gfx120X, RDNA4) | `setup_rocm_runtime.ps1` (defaults are correct) |
| RX 7000 series (gfx110X, RDNA3) | `-Device gfx1100 -FamilyIndex https://rocm.nightlies.amd.com/v2/gfx110X-all/ -RocmExtra libraries,device-gfx1100` |
| **RX 6000 series (gfx103X, RDNA2)** | see the block in [Quick start](#quick-start) — RDNA2 needs the staging index and explicit version pins |
| Strix Halo / Radeon 890M | `-FamilyIndex https://rocm.nightlies.amd.com/v2/gfx1151/` (or `v2-staging/gfx1150/`) |

RDNA2 note: the `v2` tree publishes ROCm runtime libraries for gfx103X but **no `torch`**. AMD builds
RDNA2 torch wheels under `v2-staging/gfx103X-dgpu/`, which is also what the Wan2GP Windows/AMD guide
documents for this family. Two further differences: the `rocm` sdist there publishes no
`rocm-sdk-device-<isa>` package (so use `rocm[libraries,devel]`), and torchaudio's build string is not
identical to torch's (`2.11.0a0+…` vs `2.11.0+…`).

---

## Quick start

Prerequisites: an AMD driver and Windows 11; roughly 45 GB of disk; network access to
`rocm.nightlies.amd.com` and `hf-mirror.com`.

```powershell
git clone https://github.com/Newaiguy/YuE2-T8-ROCm.git
cd YuE2-T8-ROCm

# 1) Build the ROCm runtime (embedded CPython 3.12 + AMD TheRock torch, ~6-7 GB)
powershell -ExecutionPolicy Bypass -File scripts\rocm\setup_rocm_runtime.ps1

#    RDNA2 (RX 6800 / 6900, gfx1030) instead:
#    powershell -ExecutionPolicy Bypass -File scripts\rocm\setup_rocm_runtime.ps1 `
#        -Device gfx103X-dgpu `
#        -TorchVersion '2.11.0+rocm7.13.0a20260421' `
#        -TorchAudioVersion '2.11.0a0+rocm7.13.0a20260421' `
#        -FamilyIndex 'https://rocm.nightlies.amd.com/v2-staging/gfx103X-dgpu/' `
#        -RocmExtra 'libraries,devel' -RocmFromFamilyIndex

# 2) Models (~12.2 GB; use the mirror script if huggingface.co is unreachable)
runtime\python.exe -m huggingface_hub.cli.hf download t8star/YuE2-Comfy `
    --revision a083f106499daead99259dd0c443a5494254cfc5 --local-dir models
#    or: python scripts\rocm\fetch_mirror_models.py

# 3) Verify (using t8's own manifests)
runtime\python.exe scripts\verify_models.py --root .
runtime\python.exe scripts\verify_voice_models.py --root .

# 4) Launch
start_rocm.bat            # opens http://127.0.0.1:8189 in your browser

# 5) End-to-end verification
python scripts\rocm\verify_capabilities.py
```

> The source in this repository **already has every porting patch applied**, so you do not need to run
> `apply_rocm_port.py` after step 2 (it reports SKIP for everything). You only need
> `python scripts\rocm\apply_rocm_port.py .` if you started from a clean upstream checkout.

### Generation-only install (7.8 GB instead of 12.2 GB)

If you only want to make songs, the official weights are enough and are byte-identical to the hashes
this repository pins:

```powershell
git clone --depth 1 https://github.com/multimodal-art-projection/YuE.git YuE
powershell -ExecutionPolicy Bypass -File scripts\rocm\fetch_example_models.ps1
```

`YuE/` is deliberately **not committed** (it is an upstream clone, and a nested git repository cannot
be committed cleanly) — clone it into the repository root as shown.

---

## Running the original example song

The request that ships with the upstream project is `examples/song.json` — id `city_lights`, English
warm piano pop, seed 831001, `cot="full"`.

```powershell
runtime\python.exe scripts\rocm\run_example_song.py --output outputs\city_lights
runtime\python.exe scripts\rocm\verify_example_song.py outputs\city_lights
```

The runner differs from upstream's `examples/generate.py` in three ways: it imports the
ROCm-patched `yue2` from `vendor/` (so the port actually applies), it resolves weights from local
directories instead of the Hub, and it defaults to the settings measured good on a 16 GB Windows ROCm
card (`--backend torch-eager`, `--vae-core-frames 512`, `--memory-budget-gib 16`).

Result on the RX 6800 — 48 kHz stereo, 66.679 s, all samples finite, 10 artifacts hash-verified
against `result.json`.

---

## What this fork changes

### 1. The runtime is AMD, not NVIDIA

`scripts/rocm/setup_rocm_runtime.ps1` reproduces upstream's layout and verification contract but
swaps the wheel source to AMD TheRock. It installs with **uv rather than pip** (the AMD `rocm`
package is an sdist and the embedded interpreter has no setuptools), and it asserts
`torch.version.cuda is None` at the end — otherwise a failed ROCm install silently falls back to the
PyPI CUDA build and everything still *looks* installed.

### 2. Four source fixes, all device-agnostic

| # | File | Problem → Fix |
|---|---|---|
| 1 | `vendor/yue2/cuda_graph.py` | `RuntimeError: [ROCm] mha_varlen_fwd: seqused_k must be nullopt`. Backend detection **looks only at the ATen schema**, and schemas are shared across backends → flash is picked wrongly on HIP. Fix: HIP builds are forced onto masked SDPA (measured difference from eager: **0.0**). Do **not** instead pass `seqused_k=None` — variable-length FA then attends to unused future cache slots and computes wrong results |
| 2 | `vendor/seed-vc/inference.py` | CAMPPlus / RMVPE are the last fp32 models left in `load_models()`; fp32 batchnorm makes MIOpen compile through HIPRTC at runtime, while the TheRock wheel ships no libc++ headers → `'type_traits' file not found` → `miopenStatusUnknownError`. Fix: follow `fp16` |
| 3 | `app/yue2_app/voice_worker.py` | The same JIT failure returned on other fp32 kernels. This worker disables MIOpen (in ROCm PyTorch, `torch.backends.cudnn` *is* MIOpen), so conv/BN/RNN use native implementations. **Applies on HIP only; CUDA users keep cuDNN** |
| 4 | `app/yue2_app/core_worker.py` | The VAE tile size was derived from a single budget value (`>12GiB → 1024`), implicitly assuming a 24 GB card; on 16 GB that hits a far slower MIOpen convolution solver. Fix: adapt to the card's actual VRAM (`<20GiB → 512`) — **the same request went from 613.7 s to 393.4 s (−35.9 %)** |

Fix 4 is not AMD-specific: any 16 GB card benefits. The measured tile sizes were
512 → 101.6 s, 1024 → 230.9 s, untiled → 285.0 s for the same latent, with identical audio RMS.

### 3. One site-packages patch

`descript-audiotools` (pulled in by `demucs → dac`) evaluates `dist.ReduceOp` while importing in the
class body, and torch ≥ 2.9 turns that into a lazy module → `AttributeError`, which stops Seed-VC
from starting at all. This is not an AMD problem — it reproduces on NVIDIA with torch ≥ 2.9. Fix:
`scripts/rocm/patch_audiotools.py`.

### 4. RDNA2 (gfx1030) support

See [Picking the right wheel index](#picking-the-right-wheel-index) and
[`docs/GFX1030_RX6800.md`](docs/GFX1030_RX6800.md). RDNA2 has no hardware BF16, so
`torch.cuda.is_bf16_supported()` returning `True` proves nothing — the port documents which kernels
actually compute correctly (`scripts/rocm/check_gfx1030_gpu.py` checks each against a float32
reference) and why the autoregressive stages run ~4.5× slower there.

### 5. English documentation, filenames and UI

- All documentation and launcher filenames are English. The Chinese-named launchers were renamed
  (`安装运行环境.bat` → `install_environment.bat`, and so on) and their call sites updated.
- **Every root `.bat` is now pure ASCII.** t8's own docs record that non-ASCII in a `.bat` makes
  `cmd.exe` re-tokenise lines mid-character and the launcher crash on double-click; the Chinese
  `echo`/`title` lines were the last files still carrying that risk.
- **The WebUI has an English / 中文 toggle** in the header. `app/web/i18n.js` is the engine (keyed
  strings, `data-i18n*` attributes, localStorage persistence, a `yue2:locale` event for re-renders);
  four dictionaries hold the strings; `app/yue2_app/i18n.py` + `i18n_catalog.py` handle the prose the
  *server* generates (job summaries, validation errors, worker failures) plus the
  `X-YuE2-Locale` request header. See [`docs/WEBUI_I18N.md`](docs/WEBUI_I18N.md).

  Option **values** that are validated in Python (`'中文'`, `'标准 / Standard'`, `'保留 / Preserve'`)
  are deliberately kept byte-identical and only their **labels** are translated, so saved drafts and
  the validation path are unaffected.

### 6. Verification tooling

The port ships the checks it was validated with, so a claim can be re-run rather than trusted:

| Tool | What it proves |
|---|---|
| `scripts/rocm/check_gfx1030_gpu.py` | Each GPU kernel the generation path uses, against a float32 reference |
| `scripts/rocm/measure_vram.py` | The resident VRAM floor, attributed per component |
| `scripts/rocm/verify_example_song.py` | Artifacts re-hashed against `result.json` + audio statistics |
| `scripts/rocm/verify_capabilities.py` | doctor + transcription + voice conversion through the service API |
| `scripts/rocm/check_i18n_coverage.py` | Every i18n key referenced is defined in both locales |
| `scripts/rocm/verify_server_i18n.py` | zh vs en responses across 12 endpoints |
| `scripts/rocm/verify_webui_i18n.py` | The toggle in a real browser, including the engine's own semantics |
| `scripts/rocm/run_tests.py` | The unittest suite without pytest |

Full write-up, performance data and pitfalls: **[`docs/ROCM_PORT.md`](docs/ROCM_PORT.md)**.
The three-runtime-era original report is in [`docs/PORT_REPORT.md`](docs/PORT_REPORT.md).

---

## Relationship to upstream

This repository is based on upstream **`main` (v1.3.0, `c91ab46`)** and splits the port into three
upstream PRs:

| Branch | Contents |
|---|---|
| `fix/rocm-torch-compat` | Source fixes 1–3 above |
| `feat/device-aware-vae-tile` | Fix 4 above (VRAM-adaptive VAE tiling) |
| `docs/rocm-port-guide` | `docs/ROCM_PORT.md` + `scripts/rocm/*` (new files only) |

These branches live on the fork [Newaiguy/Comfyui-YuE2-T8](https://github.com/Newaiguy/Comfyui-YuE2-T8).
The PR proposal and its reasoning are in [`docs/UPSTREAM_PR_PLAN.md`](docs/UPSTREAM_PR_PLAN.md).

If upstream merges the corresponding changes, this repository can be realigned with
`scripts/rocm/apply_rocm_port.py` (it skips changes that are already present, and reports `GONE`
instead of failing for entries whose anchor has disappeared).

> ⚠️ The node name in `pyproject.toml` is still upstream's `yue2-t8` (the ComfyUI node package name,
> which has to stay identical for ComfyUI to load it correctly). **This repository is not published —
> and should not be published — to the ComfyUI Registry**; that entry belongs to the upstream project.
> Upstream's `.github/workflows/publish.yml` has been removed from this repository precisely to avoid
> an accidental publish.

---

## Known limitations

1. **`quantization="fp8"` is never usable on ROCm.** The capability gate passes (this machine reports
   `(12, 0)`) and `torch._scaled_mm` exists, but the **relative error on the dequantized weights is
   90–117** — not a precision loss but a **computation error**, and it silently produces garbage audio.
2. **The MIOpen JIT dependency is only worked around in the voice worker**, not fixed at the root.
   Core GEMM uses precompiled kernels and is fine; a future JIT kernel would fail the same way.
   Flattening libc++ headers into the clang resource directory **does not work** — HIPRTC's search
   path does not include the resource directory.
3. **Device support is limited by AMD's wheel matrix**, not by this port. If AMD publishes no Windows
   ROCm `torch` for your family, there is no supported path here.
4. **RDNA2 is slow at generation**: ~3.3× slower end to end than RDNA4, concentrated in the two
   autoregressive stages, because BF16 is emulated.
5. **In-app self-update would overwrite the port.** This bundle makes it always return "up to date";
   to upgrade, reinstall and re-run the patch script.
6. **The NAR stage is about 16 s slower than the official CLI route** (under 5% of total runtime);
   the cause has not been identified.

---

## Licenses and attribution

- Upstream t8 code: see [`LICENSE`](LICENSE) (Copyright T8star-Aix), reused as-is here.
- **YuE2 weights: CC BY-NC 4.0 — non-commercial**, see [`MODEL_LICENSE`](MODEL_LICENSE).
- SheetSage2 / MERT: see their respective LICENSE files; Seed-VC is GPL-3.0; Demucs is MIT.
- Third-party notices: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
- Upstream projects: [multimodal-art-projection/YuE](https://github.com/multimodal-art-projection/YuE)
  (the model and CLI) and [T8mars/Comfyui-YuE2-T8](https://github.com/T8mars/Comfyui-YuE2-T8)
  (the WebUI and node pack, by the Bilibili creator T8star-Aix,
  <https://space.bilibili.com/385085361>). This port was cheap to build because t8's architecture
  (isolated workers, vendored dependencies, SHA manifest verification) already turns "swapping in a
  different runtime" into a local change.
