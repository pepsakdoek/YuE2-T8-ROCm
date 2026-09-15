# YuE2 Music T8 · Complete AMD ROCm Port ✅

> Update: items ② and ③ are both finished and verified by measurement. **All four T8 capabilities were measured working on the RX 9070 XT.**

---

## 1. Final state

| Capability | Status | Measured result |
|---|---|---|
| **generation** | ✅ | 175s of audio, done in 613.7s (including the VAE chunking that could still be optimized) |
| **transcription** | ✅ | 24s of audio → ABC score, done in 36s |
| **score_renderer** | ✅ | playwright/abcjs produces a **PDF score** + piano audition WAV |
| **voice_conversion** | ✅ | Demucs separation + Seed-VC conversion + remix, done in 47s, `audio.flac` |

All four capabilities were **actually run end to end** (not merely checked for capability flags). The UI banner shows "Runtime environment ready".

Service: `D:\YuE2\T8\start_rocm.bat` → `http://127.0.0.1:8189`

---

## 2. List of port changes (everything changed in t8)

One idempotent script applies every source patch: `scripts/rocm/apply_rocm_port.py`

| # | File | Problem | Fix |
|---|---|---|---|
| 1 | `vendor/yue2/cuda_graph.py` | Attention backend misdetected during decode. Under ROCm `device.type=="cuda"` is true and the ATen schema is shared across backends → flash gets selected → `RuntimeError: [ROCm] mha_varlen_fwd: seqused_k must be nullopt` | Force masked SDPA on HIP (difference vs eager: 0.0) |
| 2 | `app/yue2_app/core_worker.py` | `vae_core_frames` derived from a single budget value (1024 when >12GiB), implicitly assuming a 24GB card. On a 16GB AMD card, 1024 frames hit an extremely slow MIOpen solver: VAE 313s vs 156s | Adapt to the card's actual VRAM (512 when <20GiB); requests can override it explicitly |
| 3 | `runtime/voice/.../audiotools/ml/decorators.py` | demucs→dac→audiotools evaluates `dist.ReduceOp` **at class-body import time**; in torch≥2.9 `torch.distributed` is a lazy module with no `ReduceOp` until initialized → `AttributeError`, and Seed-VC cannot start | Inject a sentinel `ReduceOp` when there is no distributed setup |
| 4 | `vendor/seed-vc/inference.py` | CAMPPlus and RMVPE are the **only fp32 models left** in `load_models()` (everything else calls `.half()`); fp32 batchnorm triggers MIOpen JIT → failure; the call sites also feed fp32 features | Convert them to fp16 (consistent with the other models) + convert the dtype at the call sites |
| 5 | `app/yue2_app/voice_worker.py` | ① Several fp32 kernels in MIOpen (spatial BN, GRU/RNN) all need HIPRTC JIT, but the TheRock wheel ships no libc++ headers → `type_traits file not found`; ② torchaudio 2.11's `.save()` goes through torchcodec, and Windows has no FFmpeg shared libraries | ① Turn MIOpen off in that worker (`torch.backends.cudnn.enabled=False`) so conv/BN/RNN use PyTorch's native implementations; ② replace `torchaudio.save` with soundfile |

Added (upstream untouched):
```
scripts/setup_rocm_runtime.ps1     parameterized runtime installer (core/transcribe/voice), ROCm index
scripts/rocm/apply_rocm_port.py    idempotently applies all 5 patches
scripts/rocm/fetch_pinned_models.py / fetch_voice_models.py / stage_bootstrap.py
start_rocm.bat                     launcher (ROCm environment variables)
runtime/ffmpeg/*.dll               FFmpeg shared libraries borrowed from PyAV (fallback)
libc++ headers in the clang resource directory   for HIPRTC JIT (although solution 5 ended up bypassing it)
```

---

## 3. Key conclusions (release material)

### 3.1 Why t8 is "only two steps away" on an AMD card

The only CUDA-shaped code on the generation path is:
```python
if not torch.cuda.is_available(): raise ...      # true under ROCm (HIP alias)
if not torch.cuda.is_bf16_supported(): raise ... # True (gfx1201 supports BF16)
```
The only genuinely non-portable piece is the **cu128 wheel index** — and that is a choice made in the install script. The model hashes
are **exactly identical** to t8's pins (YuE2-3B `1d55c42c…a59e9`, YuE2-Vae `807ce9d5…7751346`; the bytes downloaded from `m-a-p`
are bit-for-bit the same as the `mrfakename` mirror).

### 3.2 torch/torchaudio versions (the biggest pitfall)

- uv resolves the two **independently**, producing the wrong pairing `torch 2.9.0+rocm7.10` × `torchaudio 2.9.0+rocm7.13`
- torch 2.9.0 (a 2025-11 build) needs `hipsparselt`, but neither its paired rocm 7.10 SDK nor the whole v4 index **has it**
- **Solution: all three roles use the core-validated `2.11.0+rocm7.13.0a20260416`** (the SDK's 22 libraries include hipsparselt,
  and both torch and torchaudio have cp311 builds of it)
- The upstream pin `torch==2.8.0 torchaudio==2.8.0` **cannot be resolved** against the ROCm index (no stable 2.8.0 torchaudio)

### 3.3 MIOpen JIT and libc++ (the deepest pitfall)

TheRock's PyTorch wheels **ship no libc++ (C++ standard library) headers**. MIOpen needs HIPRTC **runtime compilation**
for several fp32 kernels (spatial batchnorm, RNN/GRU), and comgr cannot find `type_traits` →
```
fatal error: 'type_traits' file not found  →  miopenStatusUnknownError
```
fp16 runs entirely different kernels and needs no JIT — so half-precision models dodge the specific failure.
**Root fix**: `torch.backends.cudnn.enabled = False` in the voice worker (in ROCm PyTorch the cudnn backend *is* MIOpen),
so conv/BN/RNN use PyTorch's native implementations.
Flattening the libc++ headers (1721 files) into the clang resource header directory (`lib/clang/23/include`) was also tried,
but HIPRTC's search path does not include the resource directory, so it was **ineffective** — this detour is now on record.

### 3.4 Measured performance

| Metric | Value |
|---|---|
| Generation speed (eager) | ≈ 4.5 seconds per 1 second of audio |
| Duration vs tokens | **0.04 seconds/token** (25 tok/s of audio), default ceiling 6 minutes |
| VAE chunking (60s latent) | 512→101.6s / 1024→230.9s / full→285.0s |
| AR throughput | eager 24.7 tok/s; CUDA graph 46.3 on short sequences but 14.3 on long ones |
| Seed-VC RTF | 0.79 (faster than real time) |
| Full voice conversion | 47s (24s of audio, including Demucs separation) |
| Full transcription | 36s (24s of audio, including PDF rendering) |

### 3.5 Other verified pitfalls (details in DEPLOY_NOTES.md)

- python.org blocked → mirrors + curl timeouts + a pre-staged archive
- pip cannot install the AMD `rocm` sdist (no setuptools) → **use uv**
- When the ROCm torch install fails, pip silently swaps in CUDA torch → the install script asserts `torch.version.cuda is None`
- The `python -m venv` layout ≠ t8's embeddable layout (neither junctioning nor copying works)
- huggingface_hub is incompatible with the mirror, plus Windows symlinks → plain HTTP ranged resumption (60 MiB/s with 6 parallel streams)
- SheetSage2/MERT need **all** of their remote-code .py files (trust_remote_code); downloading only REQUIRED_FILES makes loading fail
- MIOpen needs a writable SQLite tuning database (sandboxes / read-only environments get `miopenStatusUnknownError`)
- An abnormally slow first VAE decode is one-off MIOpen solver tuning, not a configuration problem
- **Do not enable `quantization="fp8"`**: the capability gate passes but `torch._scaled_mm` gives wrong results
- Delete junctions with `cmd /c rmdir`; `Remove-Item -Recurse` can delete the target's contents

---

## 4. Directories and running

```
D:\YuE2\T8\start_rocm.bat      # double-click to start the T8 WebUI (ROCm environment variables already set up)
D:\YuE2\T8\runtime\core\       # py3.12.10 + ROCm torch 2.11 (generation)
D:\YuE2\T8\runtime\transcribe\ # py3.11.9 + ROCm torch/torchaudio 2.11 (transcription)
D:\YuE2\T8\runtime\voice\      # py3.11.9 + ROCm torch/torchaudio 2.11 (voice)
D:\YuE2\models\                # 12.2 GB, four models + two manifests
D:\YuE2\venv\                  # official CLI route (run_yue2.bat)
```

Verification script: `D:\DSHWEB\_yue_probe\t8_verify_capabilities.py` (doctor + transcription + voice conversion)
Submit a generation job: `D:\DSHWEB\_yue_probe\t8_submit_job.py <request.json>`

Disk: about 47 GB free on D:.

---

## 5. TODOs (optional)

1. ~~Re-measure the speedup from Patch 2 (`vae_core_frames=512`)~~ ✅ **Done**:
   on the same Chinese request (seed 20260917, 174.919 s of audio), measured **613.7 s → 393.4 s (−35.9%)**,
   with VAE decode **313.0 s → 107.0 s**. The post-patch T8 route is now faster than the 423.4 s direct official CLI run.
   `offload_ar` True/False differs by only 4% (within noise), so the default True stays. Details in `README_ROCM_PORT.md` §1.1.
2. **Release**: put together the GitHub README (sections 2/3 of this document are the raw material) + submit the patches upstream to t8 (PR)
3. **Bilibili video**: the `tech-video-production` / `media-publish` skills are usable;
   material: 7 songs (D:\YuE2\outputs), transcription PDFs, voice-conversion results, the performance comparison table
4. The Chinese songs already include a 2:55 `zh_demo01` and `20260912-221159-666c25ab` from the T8 pipeline (same seed, same result)
