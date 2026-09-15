# YuE2 Music T8 · AMD Radeon (ROCm) Porting Guide

> The complete record and scripts for running the local studio on **AMD Radeon / native Windows ROCm**.
> Tested on: **Radeon RX 9070 XT 16GB (gfx1201 / RDNA4) · Windows 11 build 26200 ·
> native Windows ROCm (no CUDA, no Triton, no flash-attn)**.
> All four capabilities (song generation / audio-to-score / score rendering / reference timbre) **produced real artifacts in testing**,
> not merely a pass on the capability flags.

This directory also ships the scripts under `scripts/rocm/`, so this is a guide you can reproduce from — not just a report.

---

## 0. TL;DR

| | NVIDIA (existing install path) | AMD (this document) |
|---|---|---|
| PyTorch source | `download.pytorch.org/whl/cu128` | `rocm.nightlies.amd.com/v2/gfx120X-all/` (AMD TheRock) |
| Runtime layout | `runtime/python.exe` | **Identical**, no new layout |
| Source changes | — | **3 places** (see §3, purely device-agnostic robustness fixes) |
| Site-packages changes | — | **1** (`descript-audiotools`, see §3.2) |
| Song generation | ✅ | ✅ 175 s audio / 393.4 s |
| Audio-to-score (SheetSage2 + MERT) | ✅ | ✅ 24 s audio / 36 s |
| Score rendering (playwright + abcjs) | ✅ | ✅ produces PDF + piano playback WAV |
| Reference timbre (Seed-VC + Demucs) | ✅ | ✅ 47 s, produces `audio.flac`, RTF 0.79 |

**Key finding**: the only code on the song-generation path that "looks like CUDA" is a two-line self-check —

```python
if not torch.cuda.is_available(): raise ...
if not torch.cuda.is_bf16_supported(): raise ...
```

Under ROCm, `torch.cuda` is simply an **alias for HIP**, and both calls return True (gfx1201 supports BF16 natively).
The only genuinely NVIDIA-only piece is the **wheel index in the install script**. The model weights are
**bit-for-bit identical** to t8's pins (YuE2-3B `1d55c42c…a59e9`, YuE2-Vae `807ce9d5…7751346`; the bytes
downloaded from `m-a-p` / `mrfakename` match), so t8's built-in SHA manifest check passes unchanged.

---

## 1. Why this port is feasible

t8's job pipeline **spawns a separate worker process per job**, so the roles never contaminate each other:

```
service (runtime/python.exe)
  ├── kind=generate / plan / decode  → core_worker
  ├── kind=transcribe                → transcribe_worker
  ├── kind=voice_convert             → voice_worker
  └── kind=reference_cover           → workflow_worker
```

A handful of facts shaped this port:

- **There are no sm_XX / compute-capability / NVML checks anywhere**, only the two `torch.cuda` self-checks above;
- the two model stacks, `vendor/yue2/` and `vendor/seed-vc/`, **reference each other zero times**; voice conversion
  is a separate post-processing step (song generation → Demucs separation → Seed-VC timbre swap → remix);
- `MODEL_MANIFEST.json` / `VOICE_MODEL_MANIFEST.json` carry their own path/size/sha256, and the verification
  scripts trust the manifest alone — bit-identical weights are all that matters, regardless of device.

> One **version caveat** is worth stating: this document and the scripts under `scripts/rocm/` were originally
> written against t8 **v1.2.2** (which had three runtimes: `runtime/core`, `runtime/transcribe`,
> `runtime/voice`), whereas upstream has since unified them into the single `runtime/python.exe` runtime.
> **The three source changes in §3 are version-independent** (their anchors were confirmed to match verbatim
> on `main`), and `scripts/rocm/setup_rocm_runtime.ps1` has been rewritten for the single-runtime layout.
> Full measurements from the three-runtime era are in §4 / §5.

---

## 2. Installation (single-runtime layout)

Prerequisites: AMD driver + Windows 11; about 45 GB of disk; network access to `hf-mirror.com` and
`rocm.nightlies.amd.com` (`python.org` is unreachable on some networks, so the scripts fall back to mirrors).

```powershell
# 1) Fetch the code (do not use upstream's cu128 installer)
git clone --depth 1 https://github.com/T8mars/Comfyui-YuE2-T8.git YuE2-T8
cd YuE2-T8

# 2) Build the ROCm runtime (this replaces upstream's scripts/setup.ps1)
powershell -ExecutionPolicy Bypass -File scripts\rocm\setup_rocm_runtime.ps1

# 3) Apply the patches (already-merged hunks are skipped automatically; safe to re-run)
python scripts\rocm\apply_rocm_port.py .

# 4) Models (optional: download straight from the mirror when huggingface.co is unreachable)
python scripts\rocm\fetch_mirror_models.py
runtime\python.exe scripts\verify_models.py --root .
runtime\python.exe scripts\verify_voice_models.py --root .

# 5) Start
start_local_studio.bat      # or runtime\python.exe -X utf8 -m app.yue2_app.service --host 127.0.0.1 --port 8189

# 6) Capability verification (doctor + transcription/rendering + voice conversion)
python scripts\rocm\verify_capabilities.py
```

Environment variables worth setting before starting (`start_rocm.bat` already sets them):

```bat
set TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL=1
set FLASH_ATTENTION_TRITON_AMD_ENABLE=FALSE
set TORCH_BLAS_PREFER_HIPBLASLT=1
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
set YUE2_HOME=%~dp0
set YUE2_KIT=%~dp0
```

---

## 3. Every change made

### 3.1 Source code (3 places; PR-A / PR-B already submitted)

| # | File | Symptom → root cause | Fix |
|---|---|---|---|
| 1 | `vendor/yue2/cuda_graph.py` | On the first decode step: `RuntimeError: [ROCm] mha_varlen_fwd: seqused_k must be nullopt`. Backend detection **looks only at the ATen schema**, and schemas are shared across backends; under ROCm `device.type == "cuda"` is true and `_flash_attention_forward` really does declare `seqused_k`, so flash is selected wrongly | Force masked SDPA on HIP builds. Passing `seqused_k=None` instead is **not** an option — variable-length FA would attend to unused future cache slots and compute wrong results. Measured difference vs. eager: **0.0**, and replay inside the captured graph works correctly |
| 2 | `vendor/seed-vc/inference.py` | CAMPPlus / RMVPE are the **only remaining fp32 models** in `load_models()` (everything else follows `args.fp16`). fp32 batchnorm makes MIOpen **compile at runtime** through HIPRTC for `MIOpenBatchNormFwdInferSpatial`, and TheRock wheels ship no libc++ headers → `fatal error: 'type_traits' file not found` → `miopenStatusUnknownError`, so Seed-VC cannot produce a single note | Make both follow `fp16`, and cast the kaldi fbank features to the matching dtype |
| 3 | `app/yue2_app/voice_worker.py` | The same class of JIT failure kept reappearing on other fp32 kernels (spatial BN, the GRU inside RMVPE) — whack-a-mole was worse than routing around it | This worker turns MIOpen off (in ROCm PyTorch, `torch.backends.cudnn` **is** MIOpen), so conv/BN/RNN fall back to native PyTorch implementations that need no JIT. **This only takes effect when `torch.version.hip` is non-empty; CUDA users keep cuDNN**; song generation (core_worker) is unaffected and keeps using MIOpen for its heavy GEMMs |
| 4 | `app/yue2_app/core_worker.py` | The VAE tile size was derived from the single budget value (`>12GiB → 1024`), which silently assumes a 24 GB card; on a 16 GB card, 1024 frames land on a much slower convolution solver | Adapt to the actual card's VRAM (`<20GiB → 512`); requests can still override `vae_core_frames` explicitly |

### 3.2 Site packages (1 change; cannot go into the repo, so a script is provided)

`descript-audiotools` (pulled in by `demucs → dac`) evaluates `dist.ReduceOp` **at class-body import time**,
but in torch ≥ 2.9 `torch.distributed` is a lazy module that has no such attribute until a process group is
initialized:

```
AttributeError: module 'torch.distributed' has no attribute 'ReduceOp'
  audiotools/ml/decorators.py  op: dist.ReduceOp = dist.ReduceOp.AVG
```

Seed-VC therefore cannot start at all. **This is an incompatibility between descript-audiotools and modern
torch, not an AMD problem** (it reproduces on NVIDIA with torch ≥ 2.9 just the same). This port injects a
sentinel into the voice runtime's site-packages:

```powershell
python scripts\rocm\patch_audiotools.py runtime\Lib\site-packages
```

> A cleaner upstream solution might be to pin a compatible version of `descript-audiotools`, or to add a
> post-install patch step to the installer — that trade-off is for the maintainers to make.
> `apply_rocm_port.py` also handles it opportunistically when the runtime is already installed.

### 3.3 No t8-owned file was modified

Apart from the one functional change in `core_worker.py`, the existing upstream files are untouched; ROCm
users **install alongside** using the new scripts, which keeps rebasing and upstreaming straightforward.

---

## 4. Measured results

| Check | Time | Artifact |
|---|---:|---|
| Song generation (Chinese, 175 s audio, seed 20260917) | 393.4 s | `audio.flac` + `score.abc` |
| Audio-to-score (24 s audio) | 36 s | 310-character ABC + MIDI + **PDF** + piano playback `piano_mix.wav` |
| Reference timbre (24 s, `diffusion_steps=8`) | 47 s | `audio.flac` (timbre-swapped vocals + remixed accompaniment), Seed-VC **RTF 0.79** |
| doctor self-check | 12 s | GPU / BF16 / all four model SHA256s pass |

**One correctness signal**: with the same seed and the same lyrics, two completely different code paths —
"official CLI run directly" and "service → worker → vendored yue2" — produced audio with a **bit-identical**
duration (`174.91866666666667 s`), so the port introduced no behavioral drift.

### 4.1 VAE tile size (the evidence behind §3.1 #4)

The same 1499-frame (60 s audio) latent, decode only:

| tiles | `core_frames` | Decode time | Peak VRAM | RMS |
|---:|---:|---:|---:|---:|
| 12 | 128 | 104.0 s | 1.27 GB | 0.0942 |
| 6 | 256 | 161.6 s | 1.88 GB | 0.0942 |
| **3** | **512** | **101.6 s** | 3.11 GB | 0.0942 |
| 2 | 1024 | 230.9 s | 5.50 GB | 0.0942 |
| 1 | full | 285.0 s | 7.70 GB | 0.0942 |

All five RMS values are identical, so this is purely a speed difference with no effect on audio quality.
**Time is non-monotonic in tile size** (256 is slower than both 128 and 512), which shows that the dominant
factor is **MIOpen picking solvers by tensor shape** rather than a clean O(T²) relationship; 512 happens to
land in a sweet spot for this shape.

End to end (same request `zh_song.json`, seed 20260917, producing 174.919 s of audio):

| Run | wall | VAE decode | `vae_core_frames` |
|---|---:|---:|---|
| Before | 613.7 s | 313.0 s | 1024 |
| After | **393.4 s** | **107.0 s** | 512 |
| Gain | **−220.3 s (−35.9 %)** | −206 s | — |

That works out to **3.51 s per audio second → 2.25 s per audio second**; the post-change path is **already
faster than** the original direct official-CLI run of the same request at 423.4 s.

### 4.2 Other performance notes

- Song generation speed: ≈ 2.25 s per 1 s of audio (eager)
- **Song length = 0.04 s/token** (25 tokens per second of audio); the default `semantic.max_tokens=9000`
  caps it at 6 minutes. The actual length is decided by the **number of lyric sections**
- AR throughput: eager 24.7 tok/s; CUDA graph 46.3 tok/s on short sequences, dropping to 14.3 tok/s on long
  ones — masked SDPA computes attention over the **entire capacity** on every step
  (`capacity = max(len(prefix)) + max_tokens`), which upstream's flash path sidesteps with `seqused_k`,
  the very argument ROCm rejects. So **graphs only pay off at small capacity**; under production settings
  use `--backend torch-eager`

> **Benchmarking discipline**: comparisons across days drift systematically. Both of these runs used 512
> tiles, yet early VAE decode took 155.8 s and a later one 107.0 s (most likely the MIOpen solver tuning
> cache landing on disk during the first run). **Only same-day, same-session A/B comparisons are reliable**;
> allow ~15 % of headroom when comparing against historical numbers.

---

## 5. Pitfall quick reference (every one of these was hit in testing)

| Pitfall | Symptom | Workaround |
|---|---|---|
| `python.org` unreachable | `curl` hangs forever with no timeout | `--connect-timeout/--max-time` + mirror fallback; or pre-stage the archive |
| pip cannot install AMD `rocm` | `Cannot import 'setuptools.build_meta'` (sdist + embedded interpreter without setuptools) | **use uv** to create an isolated build environment |
| pip silently swaps in CUDA torch | after the ROCm torch install fails, pip pulls the cu build from PyPI and looks like it "succeeded" | assert `torch.version.cuda is None` at the end |
| torch / torchaudio mismatched | uv **resolves the two independently** and produced the ABI-incompatible pair `torch 2.9.0+rocm7.10` × `torchaudio 2.9.0+rocm7.13` | pin **the same full build string** (this port: `2.11.0+rocm7.13.0a20260416`) |
| missing `hipsparselt` | `Unknown rocm library 'hipsparselt'` | torch 2.9.0 (the 2025-11 build) needs it, but neither its paired rocm 7.10 SDK nor the entire v4 index has it; switch to 2.11.0+rocm7.13 |
| hub client cannot download models | `RemoteDisconnected` / `LocalEntryNotFoundError` / symlink `PermissionError` | direct HTTP chunked-resume download from `hf-mirror.com` (`fetch_mirror_models.py`) |
| MIOpen needs write access | `miopenStatusInternalError` (the SQLite tuning database cannot be opened) | hits in restricted sandboxes / read-only environments; ordinary user permissions are fine |
| first VAE decode is abnormally slow | 69.7 s/chunk on the first run, then 41–55 s | one-off MIOpen solver tuning, **not a configuration problem** |
| `torchaudio.save` fails | `TorchCodec is required for save_with_torchcodec` (2.9+ routes `.save()` through torchcodec, and Windows has no FFmpeg shared libraries) | switch to `soundfile` (this repo's `vendor/seed-vc/inference.py` already does) |
| SheetSage2 fails to load | missing `configuration_sheetsage2.py` and friends | `trust_remote_code` models need **every** `.py` file, not just the ones listed in `REQUIRED_FILES` |
| **Chinese text in `.bat` files crashes them instantly** | double-clicking exits at once with errors like `'IMENTAL' is not recognized` | cmd splits lines according to the current code page, and multi-byte characters **shift the line breaks**. **Keep `.bat` files ASCII-only** and print any non-ASCII messages from Python instead |

---

## 6. Known limitations / open items

1. **`quantization="fp8"` is absolutely unusable.** The capability gate is `>= (8, 9)`, and this machine
   reports **(12, 0)** ⇒ the gate passes and `torch._scaled_mm` exists, so **everything looks normal**.
   But measured against dequantized weights (including the real lm_head shape `M=1 K=2048 N=184704`),
   the **relative error is 90–117**:

   | Shape | vs. dequantized reference |
   |---|---:|
   | M=16 K=2048 N=512 | 99.99863 |
   | M=16 K=2048 N=2048 | 109.82619 |
   | M=1 K=2048 N=184704 (lm_head) | 116.88484 |
   | M=1500 K=2048 N=2048 (prefill) | 89.68730 |

   This is not a loss of precision but a **computation error** — enabling it silently produces garbage
   audio. The recommendation is to explicitly exclude HIP builds in the capability gate inside
   `quantization.py`.

2. **MIOpen's JIT dependency is not resolved at the root.** §3.1 #3 only routes the voice worker around it.
   core's GEMMs use precompiled kernels and measured fine, but if the core path ever triggers a new JIT
   kernel it will fail the same way. The thorough fix is to give comgr the libc++ headers — **note**:
   flattening LLVM's libc++ headers (1721 files) into the clang resource directory `lib/clang/23/include`
   **does not work**, because HIPRTC's search path does not include the resource directory. Recording this
   dead end so nobody walks it twice.

3. **Upstream's pinned torch version has changed.** t8 v1.2.2 pins `torch==2.8.0`; the current
   `requirements-unified.lock.txt` has `torch==2.10.0+cu128`. The `descript-audiotools` issue in §3.2 holds
   for torch ≥ 2.9, so it is worth confirming on the NVIDIA side as well (we only measured it on
   ROCm/torch 2.11).

4. **The NAR stage runs about 16 s slower than the official CLI path** (40.7 s vs 24.7 s); the cause is not
   identified and may be related to `nar_query_chunk_size` (t8 passes 256) or `offload_ar`. That is < 5 % of
   total runtime, so we did not dig further.

5. **The in-app self-updater overwrites hand-modified environments.** "Update to vX" re-extracts the whole
   package, silently wiping local changes for anyone who has modified their kit (not just AMD users).
   Upstream commit `c91ab46` already changed updates to code-only, which is the right direction; this port
   makes the updater always report "already up to date" and moves upgrading to a manual step (reinstall the
   new version, then re-run `apply_rocm_port.py`).

---

## 7. License

t8's code is covered by the repository's `LICENSE`; YuE2 weights are **CC BY-NC 4.0 (non-commercial)**;
SheetSage2 / MERT have their own LICENSE files; Seed-VC is **GPL-3.0**; Demucs is MIT.
The scripts in this directory follow the repository license.
