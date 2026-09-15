# YuE2 Music T8 · Complete AMD Radeon (ROCm) Port Report

> **This is the full record of porting [T8mars/Comfyui-YuE2-T8](https://github.com/T8mars/Comfyui-YuE2-T8) (upstream supports NVIDIA CUDA only)
> to AMD Radeon / native Windows ROCm.**
> Test environment: AMD Radeon RX 9070 XT 16GB (gfx1201 / RDNA4) · Windows 11 build 26200 · t8 v1.2.2
> All four capabilities (song generation / audio transcription / score rendering / reference timbre) **were measured producing real artifacts**, not just capability flags.

---

## 0. TL;DR

| | NVIDIA (upstream) | AMD (this port) |
|---|---|---|
| PyTorch | `download.pytorch.org/whl/cu128` | `rocm.nightlies.amd.com/v2/gfx120X-all/` (AMD TheRock) |
| Application code changes | — | **5** (applied by one idempotent script, see §3) |
| Install script changes | — | **1** (wheel index, see §3) |
| Song generation | ✅ | ✅ 175s of audio / 613.7s |
| Audio transcription (SheetSage2+MERT) | ✅ | ✅ 24s of audio / 36s |
| Score rendering (playwright+abcjs) | ✅ | ✅ produces PDF + piano audition WAV |
| Reference timbre (Seed-VC+Demucs) | ✅ | ✅ 47s, produces audio.flac |

**Core conclusion**: the only application code on t8's generation path that "looks like
CUDA" is the pair of self-checks `torch.cuda.is_available()` and
`torch.cuda.is_bf16_supported()` — under ROCm, `torch.cuda` is just an alias for HIP and
both return True (the "NVIDIA" in the error text is only wording). The only genuinely
NVIDIA-only piece is the **wheel index in the install script**, not the application itself.

The model weights are **bit-for-bit identical** to t8's pins (YuE2-3B sha256
`1d55c42c…a59e9`, YuE2-Vae `807ce9d5…7751346`; the bytes downloaded from the official
`m-a-p` repo match the `mrfakename` mirror).

---

## 1. Measured results (data you can cite directly)

| Verification | Time | Artifact |
|---|---:|---|
| Song generation (Chinese, 175s of audio, seed 20260917) | 613.7s | `audio.flac` + `score.abc` |
| Audio transcription (24s of audio) | 36s | 310-character ABC + MIDI |
| Score rendering | included above | **PDF** + piano audition `piano_mix.wav` |
| Reference timbre (24s, diffusion_steps=8) | 47s | `audio.flac` (converted vocals + remixed backing track), Seed-VC RTF 0.79 |
| doctor self-check | 12s | GPU/BF16/all four model SHA256s pass |

Performance reference points (same card):
- Generation speed: ≈ 4.5 seconds per 1 second of audio (eager backend)
- **Song length = 0.04 seconds/token** (25 tokens per second of audio); the default `semantic.max_tokens=9000` → a 6-minute ceiling;
  length is decided by the **number of lyric sections** (the official example has only 2, so it yields just 1 minute)
- VAE chunking has an enormous effect on speed (same 60s latent): 512 frames → 101.6s; 1024 frames → 230.9s; no chunking → 285.0s
- AR throughput: eager 24.7 tok/s; CUDA graph 46.3 tok/s on short sequences but only 14.3 tok/s on long ones
  (masked SDPA attends over the entire capacity at every step; upstream avoids this with `seqused_k`, and ROCm rejects that argument)

**A correctness signal**: with the same seed and the same lyrics, "official CLI run
directly" and t8's "service→worker→vendored yue2" — two completely different code paths —
produced **bit-for-bit identical** audio durations (`174.91866666666667s`) — the port
introduced no behavioral drift.

### 1.1 Generation speed: what Patch 2 actually bought (three runs of the same request)

The request is fixed as `zh_song.json` (Chinese, seed 20260917, producing **174.919 s** of
audio, all with `truncated=false`).
wall = from job submission to status=complete (API polling, 4 s interval).

| Run | wall | ABC | semantic | NAR | **VAE decode** | `vae_core_frames` | `offload_ar` |
|---|---:|---:|---:|---:|---:|---|---|
| T8 **before Patch 2** | 613.7 s | — | ~176 s | ~40 s | **313.0 s** | 1024 | True |
| T8 **after Patch 2** (default) | **393.4 s** | 49.1 s | 174.7 s (25.0 tok/s) | 40.7 s | **107.0 s** | **512** | True |
| T8 after Patch 2 (`offload_ar=false`) | 409.4 s | 51.2 s | 178.8 s (24.5 tok/s) | 38.7 s | 107.2 s | 512 | False |
| Official CLI run directly (baseline) | 423.4 s | 52.3 s | 180.5 s (24.2 tok/s) | 24.7 s | 155.8 s | 512 | False |

**Conclusions**

- **Patch 2 takes the same request from 613.7 s down to 393.4 s (−220.3 s, −35.9%)**, of
  which VAE decode drops from 313.0 s to 107.0 s (−206 s) — the gap comes almost entirely
  from VAE chunking, so the diagnosis holds.
  Normalized by audio duration: **3.51 s per second of audio → 2.25 s per second of audio**.
- After the patch the T8 route is **already faster** than the original direct official CLI
  run (393.4 s vs 423.4 s).
- `offload_ar` True vs False differs by only 16 s (4%), within noise → **keep t8's default
  `True`** (kinder to VRAM, and measurably no slower).

**Measurement caveat (important)**: cross-day comparisons drift systematically. With the
same `vae_core_frames=512`, the earlier VAE decode took 155.8 s and this one 107.0 s — most
likely **MIOpen's solver tuning cache being persisted to disk on the first run** (which
also explains the "first VAE decode is abnormally slow" effect). So **the same-day,
same-session A/B pair is the only reliable comparison**, and ~15% of headroom should be
allowed when comparing against historical numbers.

Raw data: `speed_compare.json` (includes the job id and per-stage timing of every run).


---

## 2. Port architecture (why this works)

```
t8's job pipeline (each job starts its own worker process, isolating the runtime):
  service (runtime/core)  ──┬── kind=generate/plan/decode → core_worker      (runtime/core)
                            ├── kind=transcribe         → transcribe_worker  (runtime/transcribe)
                            ├── kind=voice_convert      → voice_worker       (runtime/voice)
                            └── kind=reference_cover    → workflow_worker    (core)

The three workers are three unrelated Python environments → each one can deal with its own GPU compatibility problems.
```

Key facts (which determined the shape of the port):
- The only CUDA-shaped code on the generation path is the two self-check lines above; **there are no sm_XX / capability / nvml checks**
- t8's two model stacks, `vendor/yue2/` and `vendor/seed-vc/`, **reference each other zero times**:
  voice conversion is a piece of **generic post-processing** the t8 author added (YuE2 generation → Demucs separation → Seed-VC timbre swap → remix),
  unrelated to the YuE2 model itself (the official docs state explicitly that YuE2 **does not guarantee** timbre consistency after editing)
- The model manifests (`MODEL_MANIFEST.json` / `VOICE_MODEL_MANIFEST.json`) carry path/size/sha256,
  and the verification script trusts only the manifest — so the weights must be bit-for-bit identical to the pins

---

## 3. All changes

### 3.1 Source patches (7, applied idempotently by `scripts/rocm/apply_rocm_port.py`)

| # | File | Problem (symptom → root cause) | Fix |
|---|---|---|---|
| 1 | `vendor/yue2/cuda_graph.py` | During decode, `RuntimeError: [ROCm] mha_varlen_fwd: seqused_k must be nullopt`. GraphAR picks its backend with a probe that **looks only at the ATen schema**; under ROCm `device.type=="cuda"` is true and the schema is shared across backends → flash gets selected by mistake | Force masked SDPA on HIP. Do not instead pass `seqused_k=None` (variable-length FA would attend to unused cache slots → wrong results). Measured difference vs eager: 0.0 |
| 2 | `app/yue2_app/core_worker.py` | `vae_core_frames` is derived from a single budget value (`>12GiB → 1024`), implicitly assuming a 24GB card. On a 16GB AMD card, 1024 frames hit a far slower MIOpen solver: **VAE 313s vs 156s** | Adapt to the card's actual VRAM (512 when <20GiB); a request can override it explicitly |
| 3 | `runtime/voice/…/audiotools/ml/decorators.py` | demucs→dac→audiotools evaluates `dist.ReduceOp` **at class-body import time**; in torch≥2.9 `torch.distributed` is a lazy module with no `ReduceOp` until the process group is initialized → `AttributeError`, and Seed-VC cannot start | Inject a sentinel ReduceOp when there is no distributed setup |
| 4 | `vendor/seed-vc/inference.py` | CAMPPlus and RMVPE are the only fp32 models left in `load_models()`; fp32 batchnorm triggers MIOpen JIT → `miopenStatusUnknownError`; the call sites also feed fp32 features | Convert to fp16 (matching whisper/hubert/wav2vec) + convert the dtype at the call sites |
| 5 | `app/yue2_app/voice_worker.py` | ① Several fp32 kernels in MIOpen (spatial BN, RNN/GRU) all need HIPRTC **runtime compilation**, but the TheRock wheel ships no libc++ headers → `type_traits file not found`; ② torchaudio 2.11's `.save()` goes through torchcodec, and Windows has no FFmpeg shared libraries | ① Set `torch.backends.cudnn.enabled=False` in that worker (in ROCm PyTorch this is the MIOpen backend), so conv/BN/RNN use PyTorch's native implementations; ② replace `torchaudio.save` with soundfile |
| 6 | `app/yue2_app/updater.py` | The in-app "Update to v1.3.0" pulls the release package from GitHub and **overwrites the entire kit** → all 5 ROCm patches and the ROCm PyTorch get wiped out | `public_update()` always returns "up to date"; upgrading becomes manual (reinstall the new version, then re-run this patch script) |
| 7 | `app/web/index.html` + the self-check strings in 3 workers | The interface says "all inference runs on your **NVIDIA** GPU" and the self-check error says "no **NVIDIA CUDA** detected" — misleading on a HIP build (users would assume it is unsupported) | Changed to AMD / "CUDA/HIP". **Wording only, no behavioral change** (the self-check itself goes through the HIP alias and already passed) |

> Patch 5 is the **root fix**: instead of playing whack-a-mole kernel by kernel (fix the BN and the GRU blows up), it bypasses MIOpen's JIT path inside that worker.
> The only cost is some conv throughput inside Seed-VC/Demucs (RTF 0.79 is still faster than real time);
> **song generation (core_worker) is unaffected and keeps running heavy GEMMs on MIOpen**.
> We also tried flattening the LLVM libc++ headers (1721 files) into the clang resource directory `lib/clang/23/include` —
> **HIPRTC's search path does not include the resource directory, so it had no effect**. This detour is recorded here so it is not repeated.

### 3.2 Install script (1 change)

`scripts/setup_rocm_runtime.ps1` (new; replaces the runtime portion of the upstream `setup.ps1`):
- The embedded interpreter layout matches upstream exactly (`runtime/<role>/python.exe` at the root; `python -m venv` cannot produce this layout,
  and both junctioning and copying python.exe were tried and failed — `sys.prefix` resolves incorrectly)
- The wheel index is switched to AMD TheRock: `rocm[libraries,device-gfx1201]` (v4/whl) + torch (v2/gfx120X-all)
- **Use uv rather than pip**: the AMD `rocm` package is an sdist and the embeddable interpreter has no setuptools, so pip reports
  `Cannot import 'setuptools.build_meta'`; uv builds an isolated build environment for sdists
- Assert `torch.version.cuda is None` at the end of installation: otherwise, if the ROCm torch install fails, pip **silently** swaps in the CUDA build
- python.org is unreachable from some networks and hangs forever without a timeout → mirror list (Huawei Cloud / npmmirror / Alibaba) + curl timeouts

### 3.3 All three roles on one shared torch build (an important deviation, with the reasoning spelled out)

**The upstream pin `torch==2.8.0 torchaudio==2.8.0` cannot be resolved against the ROCm index**
(there is no stable cp311 torchaudio 2.8.0, only a `2.8.0a0` prerelease that pairs with an older ROCm).
And in practice we hit this: uv resolves the two **independently**, producing the ABI-mismatched pair
`torch 2.9.0+rocm7.10.0a20251117` × `torchaudio 2.9.0+rocm7.13.0a20260416`; worse, torch 2.9.0 (a 2025-11
build) needs `hipsparselt`, and neither its paired rocm 7.10 SDK nor the entire v4 index contains that library.

**Solution**: all three roles use the core-validated `torch==2.11.0+rocm7.13.0a20260416`
(that ROCm build's SDK lists 22 libraries including hipsparselt; both torch and torchaudio have cp311 builds of it).

---

### 3.4 Two engineering rules for the port script (you only learn them by getting burned)

1. **The patch script must preserve the original file's line endings.** Early versions wrote back with Python's `Path.write_text()`,
   which on Windows translates every `\n` into `\r\n` — turning a 2-line fix into a whole-file diff
   (measured: `transcribe_worker.py` grew from 4836 B to 4957 B, the extra 106 bytes being 106 spurious CRs).
   Everything now uses `open(..., newline="")` for reading and writing, so line endings are preserved verbatim.
2. **The whole change set must be replayable and idempotent.** Measured on a **clean, unpatched upstream checkout**,
   `apply_rocm_port.py` reports all 8 anchors as `PATCH` with `APPLY_EXIT=0`; re-running yields all `SKIP`; and the output is
   **byte-for-byte identical** to the measured kit described in this document (identical SHA256 for 7 source files).
   This is the precondition for submitting a PR.

### 3.5 Common parameter Q&A

**"The VRAM budget in Advanced Settings defaults to 23.5 — should I change it to 15.5?" — No need.**

`memory_budget_gib` is not actual usage but a **process ceiling**, and the pipeline clamps it to the real card automatically:

```python
budget = min((memory_budget_gib - 2) * 2**30, total - 2 * 2**30)
# On a 16 GB card (15.92 GiB): 23.5 -> min(21.5, 13.92) = 13.92 GiB
#                              15.5 -> min(13.5, 13.92) = 13.5  GiB  ← actually lower, zero gain
```

Measured peak usage is only 11~12 GB. What really affects speed is `vae_core_frames` (1024 frames is 2.3× slower than 512 frames),
and Patch 2 already changed it to **pick 512 automatically from the card's actual VRAM**, independent of this budget value. So just leave the default alone.

---

## 4. Reproduction steps (fresh machine)

```
0) Prerequisites: AMD driver + Windows 11; about 45GB of disk; network access to hf-mirror.com and rocm.nightlies.amd.com
   (python.org may be unreachable — the script falls back to mirrors; a proxy is optional and only needed for GitHub fetches)

1) Clone t8 (the code is enough; models/runtime are not needed):
   git clone --depth 1 https://github.com/T8mars/Comfyui-YuE2-T8.git YuE2-T8

2) Install the three ROCm runtimes (6~7GB each):
   powershell -ExecutionPolicy Bypass -File scripts\setup_rocm_runtime.ps1 -Role core
   powershell -ExecutionPolicy Bypass -File scripts\setup_rocm_runtime.ps1 -Role transcribe
   powershell -ExecutionPolicy Bypass -File scripts\setup_rocm_runtime.ps1 -Role voice

3) Apply all source patches:
   python scripts\rocm\apply_rocm_port.py <kit_dir>

4) Models (12.2GB, via hf-mirror ranged resumption):
   python scripts\rocm\fetch_pinned_models.py  # SheetSage2 + MERT completion + MODEL_MANIFEST.json
   python scripts\rocm\fetch_voice_models.py   # Seed-VC + Demucs + VOICE_MODEL_MANIFEST.json
   # Verify integrity with t8's own scripts:
   runtime\core\python.exe scripts\verify_models.py --root <kit_dir>
   runtime\core\python.exe scripts\verify_voice_models.py --root <kit_dir>

5) Start: double-click start_rocm.bat  →  http://127.0.0.1:8189

6) Verify (t8's built-in doctor + the three job types):
   python scripts\rocm\verify_capabilities.py
```

Note: `scripts\rocm\fetch_*.py` is a **direct-to-mirror** ranged-resumption implementation — the huggingface_hub
client is unusable in this network environment (the hub gets `RemoteDisconnected` on large files from `huggingface.co`,
the mirror is incompatible with the hub client, and cache symlinks raise `PermissionError` on Windows without Developer Mode).

---

## 5. Known limitations / open items

1. **MIOpen's JIT dependency is not fully solved**: Patch 5 only routes the voice worker around it. core's GEMMs use
   precompiled kernels and are measurably fine; but if the core path ever triggers a new JIT kernel, it will fail in the same way.
   The complete fix is to give comgr the libc++ headers (flattening them into the resource directory does not work; the correct approach is still to be found).
2. **`quantization="fp8"` must never be used**: the capability gate passes (capability `(12,0) >= (8,9)`)
   and `torch._scaled_mm` exists, but the relative error against dequantized weights reaches 90~117 — **not precision loss but a computational error** —
   and it will silently produce garbage audio.
3. **torchaudio 2.11's `.save()` depends on torchcodec**: this port replaces it with soundfile inside the voice worker
   (WAV output only, equivalent). If a general torchcodec is needed, you must supply FFmpeg shared libraries yourself (PyAV's DLLs were measured and do not pair correctly).
4. **Upstream `setup.ps1` is untouched**: this port adds a new script alongside it and neither deletes nor modifies upstream files —
   which keeps rebasing and PR submission easy.
5. **The NAR stage is about 16 s slower than the official CLI route** (T8 40.7 s vs CLI 24.7 s); the cause is not pinned down,
   but it may be related to `nar_query_chunk_size` (T8 passes 256) or `offload_ar`; it accounts for <5% of total time, so it was not investigated further.

---

## 6. Quick reference for common pitfalls (all hit and measured in practice)

| Pitfall | Symptom | Fix |
|---|---|---|
| python.org blocked | curl hangs forever with no timeout | `--connect-timeout/--max-time` + mirror fallback; or a pre-staged archive |
| pip cannot install AMD `rocm` | `Cannot import 'setuptools.build_meta'` | Use uv (isolated sdist builds) |
| pip silently swaps in CUDA torch | After the ROCm torch install fails, pip pulls the cu build from PyPI | Assert `torch.version.cuda is None` |
| venv layout mismatch | t8 needs `runtime/<role>/python.exe` at the root | The embeddable build is mandatory; junctioning/copying python.exe both fail |
| Hub client cannot download models | `RemoteDisconnected` / `LocalEntryNotFoundError` / symlink `PermissionError` | Plain HTTP ranged resumption straight from the mirror |
| MIOpen needs write permission | `miopenStatusInternalError` (SQLite tuning DB) | Sandboxes / read-only environments hit it; ordinary user permissions are fine |
| First VAE decode abnormally slow | 69.7s/chunk on the first run vs 41~55s afterwards | One-off MIOpen solver tuning, not a configuration problem |
| Deleting a junction | `Remove-Item -Recurse` can delete the target's contents | `cmd /c rmdir` |
| SheetSage2 fails to load | Missing `configuration_sheetsage2.py` and similar | trust_remote_code models need **all** their .py files, not just REQUIRED_FILES |
| torchaudio.save fails | `No module named torchcodec` | See Patch 5/6 |
| torch/torchaudio mismatched pair | ABI mismatch / missing hipsparselt | Pin the same complete build string (§3.3) |

---

## 7. Directory structure

```
D:\YuE2\T8\start_rocm.bat            double-click to start (ROCm environment variables)
D:\YuE2\T8\runtime\core\             py3.12.10 + ROCm torch 2.11 (generation)
D:\YuE2\T8\runtime\transcribe\       py3.11.9  + ROCm torch/torchaudio 2.11 (transcription)
D:\YuE2\T8\runtime\voice\            py3.11.9  + ROCm torch/torchaudio 2.11 (voice)
D:\YuE2\models\                      12.2GB, four models + two manifests
D:\YuE2\venv\                        official YuE2 CLI route (run_yue2.bat, independent of this port)
D:\YuE2\T8\scripts\rocm\             all scripts belonging to this port
```

Licenses: t8 code Apache/MIT (see its LICENSE); YuE2 weights CC BY-NC 4.0 (**non-commercial**);
SheetSage2/MERT per their own LICENSEs; Seed-VC GPL-3.0. Please double-check before publishing.
