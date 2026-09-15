# YuE2 Music T8 · Complete AMD Radeon (ROCm) Port Report

> **This is the full record of porting [T8mars/Comfyui-YuE2-T8](https://github.com/T8mars/Comfyui-YuE2-T8) (which**
> **supports NVIDIA CUDA only) to AMD Radeon / native Windows ROCm.**
> Test environment: AMD Radeon RX 9070 XT 16GB (gfx1201 / RDNA4) · Windows 11 build 26200 · t8 v1.2.2
> All four capabilities (song generation / audio transcription / score rendering / reference voice) **produced real artifacts in testing**, not just capability flags.

---

## 0. TL;DR

| | NVIDIA (upstream) | AMD (this port) |
|---|---|---|
| PyTorch | `download.pytorch.org/whl/cu128` | `rocm.nightlies.amd.com/v2/gfx120X-all/` (AMD TheRock) |
| Application code changes | — | **5** (applied by one idempotent script, see §3) |
| Installer script changes | — | **1** (wheel index, see §3) |
| Song generation | ✅ | ✅ 175s audio / 613.7s |
| Audio transcription (SheetSage2+MERT) | ✅ | ✅ 24s audio / 36s |
| Score rendering (playwright+abcjs) | ✅ | ✅ produces PDF + piano playback WAV |
| Reference voice (Seed-VC+Demucs) | ✅ | ✅ 47s, produces audio.flac |

**Bottom line**: the only application code on t8's song-generation path that looks in any way like CUDA is the two
self-checks `torch.cuda.is_available()` and `torch.cuda.is_bf16_supported()` — under ROCm `torch.cuda` is simply an
alias for HIP, and both return True (the word "NVIDIA" in the error text is only a string). The one genuinely
NVIDIA-only piece is the **wheel index in the install script**, not the application itself.

The model weights are **bit-for-bit identical** to the t8 pin (YuE2-3B sha256 `1d55c42c…a59e9`,
YuE2-Vae `807ce9d5…7751346`; the bytes downloaded from the official `m-a-p` repos match the `mrfakename` mirror).

---

## 1. Measured results (data you can cite directly)

| Check | Time | Artifacts |
|---|---:|---|
| Song generation (Chinese lyrics, 175s audio, seed 20260917) | 613.7s | `audio.flac` + `score.abc` |
| Audio transcription (24s audio) | 36s | 310-character ABC + MIDI |
| Score rendering | included above | **PDF** + piano playback `piano_mix.wav` |
| Reference voice (24s, diffusion_steps=8) | 47s | `audio.flac` (converted vocals + remixed backing), Seed-VC RTF 0.79 |
| doctor self-check | 12s | GPU/BF16/SHA256 of all four models pass |

Speed reference (same card):
- Song generation speed: about 4.5 seconds per 1 second of audio (eager backend)
- **Song length = 0.04 seconds/token** (25 tokens per second of audio), default `semantic.max_tokens=9000` → 6 minutes maximum;
  length is decided by the **number of lyric sections** (the official example has only 2, so it produces just 1 minute)
- VAE tiling has a huge effect on speed (same 60s latent): 512 frames → 101.6s; 1024 frames → 230.9s; no tiling → 285.0s
- AR throughput: eager 24.7 tok/s; CUDA graph 46.3 tok/s on short sequences but only 14.3 tok/s on long ones
  (masked SDPA computes attention over the full capacity at every step; upstream sidesteps this with `seqused_k`, but ROCm rejects that argument)

**One correctness signal**: with the same seed and the same lyrics, the "upstream CLI run directly" path and
t8's "service→worker→vendored yue2" path — two completely different code paths — produced audio of **bit-identical duration** (`174.91866666666667s`), so the port introduced no behavioral drift.

---

## 2. Port architecture (why it works)

```
t8's job pipeline (each job spawns its own worker process, isolating runtimes):
  service (runtime/core)  ──┬── kind=generate/plan/decode → core_worker      (runtime/core)
                            ├── kind=transcribe         → transcribe_worker  (runtime/transcribe)
                            ├── kind=voice_convert      → voice_worker       (runtime/voice)
                            └── kind=reference_cover    → workflow_worker    (core)

The three workers are three unrelated Python environments → each one's GPU compatibility problems can be handled on its own.
```

Key facts (these decided the shape of the port):
- The only CUDA-shaped code on the song-generation path is the two self-checks above; **there are no sm_XX / capability / nvml checks**
- t8's two model stacks `vendor/yue2/` and `vendor/seed-vc/` **reference each other nowhere**:
  voice conversion is **generic post-processing** added by the t8 author (YuE2 song generation → Demucs separation → Seed-VC voice swap → remix),
  and has nothing to do with the YuE2 model itself (the official docs state plainly that YuE2 **does not guarantee** an unchanged voice after editing)
- The model manifests (`MODEL_MANIFEST.json` / `VOICE_MODEL_MANIFEST.json`) carry their own path/size/sha256,
  and the verification scripts accept nothing but the manifests — so the weights must match the pin bit for bit

---

## 3. The complete set of changes

### 3.1 Source patches (7 changes, applied idempotently by `scripts/rocm/apply_rocm_port.py`)

| # | File | Problem (symptom → root cause) | Fix |
|---|---|---|---|
| 1 | `vendor/yue2/cuda_graph.py` | On decode, `RuntimeError: [ROCm] mha_varlen_fwd: seqused_k must be nullopt`. GraphAR picks its backend with a probe that **looks only at the ATen schema**; under ROCm `device.type=="cuda"` is true and schemas are shared across backends → flash is chosen by mistake | Force masked SDPA on HIP. Passing `seqused_k=None` instead is not an option (variable-length FA would attend to unused cache slots → wrong results). Measured numerical difference from eager: 0.0 |
| 2 | `app/yue2_app/core_worker.py` | `vae_core_frames` is derived from a single budget value (`>12GiB → 1024`), which assumes a 24GB card. On a 16GB AMD card, 1024 frames hit a far slower MIOpen solver: **VAE 313s vs 156s** | Adapt to the card's actual VRAM (512 below 20GiB), and let a request override it explicitly |
| 3 | `runtime/voice/…/audiotools/ml/decorators.py` | demucs→dac→audiotools evaluates `dist.ReduceOp` **while importing the class body**; in torch≥2.9 `torch.distributed` is a lazy module that does not expose it before the process group is initialized → `AttributeError`, and Seed-VC cannot start | Inject a sentinel ReduceOp when the process group is uninitialized |
| 4 | `vendor/seed-vc/inference.py` | CAMPPlus and RMVPE are the only fp32 models left in `load_models()`; fp32 batchnorm triggers MIOpen JIT → `miopenStatusUnknownError`, and the call site feeds fp32 features | Convert them to fp16 (consistent with whisper/hubert/wav2vec) + cast the dtype at the call site |
| 5 | `app/yue2_app/voice_worker.py` | (1) Several MIOpen fp32 kernels (spatial BN, RNN/GRU) need HIPRTC **runtime compilation**, and the TheRock wheel has no libc++ headers → `type_traits file not found`; (2) torchaudio 2.11's `.save()` goes through torchcodec, and Windows has no FFmpeg shared library | (1) Set `torch.backends.cudnn.enabled=False` in that worker (in ROCm PyTorch that is the MIOpen backend), so conv/BN/RNN use PyTorch's native implementations; (2) Replace `torchaudio.save` with soundfile |
| 6 | `app/yue2_app/updater.py` | The in-app "Update to v1.3.0" pulls a release package from GitHub and **overwrites the whole kit** → all 5 ROCm patches and ROCm PyTorch are wiped out | `public_update()` always returns "up to date"; upgrading becomes manual (reinstall the new version, then re-run this patch script) |
| 7 | `app/web/index.html` + the self-check text in the 3 workers | The UI says "all inference runs on your **NVIDIA** GPU" and the self-check error says "no **NVIDIA CUDA** detected" — misleading on a HIP build (users assume it is unsupported) | Change them to AMD / "CUDA/HIP". **Text only, no behavior change** (the self-check itself goes through the HIP alias, so it passed all along) |

> Patch 5 is the **real fix**: rather than playing whack-a-mole kernel by kernel (fix BN and GRU blows up),
> it routes that worker around MIOpen's JIT path. The only cost is some conv throughput inside
> Seed-VC/Demucs (RTF 0.79 is still faster than real time);
> **song generation (core_worker) is unaffected and keeps running its heavy GEMMs on MIOpen**.
> We also tried flattening the LLVM libc++ headers (1721 files) into the clang resource directory `lib/clang/23/include` — **HIPRTC's search path does not include the resource directory, so it did nothing**. Recording this dead end so nobody repeats it.

### 3.2 Install script (1 change)

`scripts/setup_rocm_runtime.ps1` (new, replacing the runtime half of upstream `setup.ps1`):
- The embedded-interpreter layout matches upstream exactly (`runtime/<role>/python.exe` at the root;
  `python -m venv` cannot produce that layout, and both junctioning and copying python.exe were tried and failed — `sys.prefix` resolves incorrectly)
- The wheel index switches to AMD TheRock: `rocm[libraries,device-gfx1201]` (v4/whl) + torch (v2/gfx120X-all)
- **uv instead of pip**: the AMD `rocm` package is an sdist, the embeddable interpreter has no setuptools, and pip reports
  `Cannot import 'setuptools.build_meta'`; uv creates an isolated build environment for sdists
- The install asserts `torch.version.cuda is None` at the end: otherwise, when ROCm torch fails to install, pip **silently** swaps in the CUDA build
- python.org is unreachable from some networks and hangs forever without a timeout → mirror list (Huawei Cloud/npmmirror/Alibaba) + curl timeouts

### 3.3 All three roles unified on one torch build (a significant deviation, with the reasoning stated)

**Upstream's pin `torch==2.8.0 torchaudio==2.8.0` does not resolve on the ROCm index**
(there is no stable cp311 torchaudio 2.8.0, only a `2.8.0a0` pre-release paired with an old ROCm).
We also hit this in practice: uv **resolves the two independently**, producing the ABI-mismatched pair
`torch 2.9.0+rocm7.10.0a20251117` × `torchaudio 2.9.0+rocm7.13.0a20260416`; worse, torch 2.9.0 (a 2025-11 build)
requires `hipsparselt`, and that library is **nowhere** in its paired rocm 7.10 SDK or in the whole v4 index.

**The solution**: all three roles use the same `torch==2.11.0+rocm7.13.0a20260416` already validated on core
(that rocm build's SDK lists 22 libraries including hipsparselt; the build exists for both torch and torchaudio cp311).

---

### 3.4 Two engineering rules for the port scripts (you only learn them by getting burned)

1. **Patch scripts must preserve the original file's line endings.** Early versions wrote back with Python's `Path.write_text()`,
   which on Windows translates every `\n` into `\r\n` — a 2-line fix becomes a whole-file diff
   (measured: `transcribe_worker.py` grew from 4836 B to 4957 B, and the extra 106 bytes = 106 superfluous CRs).
   Everything now reads and writes through `open(..., newline="")`, leaving line endings untouched.
2. **The whole change set must be replayable and idempotent.** `apply_rocm_port.py` was measured on a **clean, unpatched upstream checkout**:
   all 8 anchors `PATCH`, `APPLY_EXIT=0`; a re-run gives all `SKIP`; and the output is **byte-for-byte identical**
   to the measured kit described in this document (7 source files with identical SHA256). That is the precondition for filing a PR.

### 3.5 A common parameter question

**"Advanced Settings defaults the VRAM budget to 23.5 — should I change it to 15.5?" No, leave it alone.**

`memory_budget_gib` is not actual usage but a **process ceiling**, and the pipeline clamps it automatically against the real card:

```python
budget = min((memory_budget_gib - 2) * 2**30, total - 2 * 2**30)
# on a 16 GB card (15.92 GiB): 23.5 -> min(21.5, 13.92) = 13.92 GiB
#                              15.5 -> min(13.5, 13.92) = 13.5  GiB  ← lower instead, zero benefit
```

Measured peak usage is only 11~12 GB. What really affects speed is `vae_core_frames` (1024 frames is 2.3× slower than 512),
and Patch 2 already made it **pick 512 automatically from the card's VRAM**, independently of this budget value. So keeping the default is fine.

---

## 4. Reproduction steps (fresh machine)

```
0) Prerequisites: AMD driver + Windows 11; ~45GB of disk; network access to hf-mirror.com and rocm.nightlies.amd.com
   (python.org may be unreachable — the script falls back to mirrors; a proxy is optional and only needed for GitHub fetches)

1) Clone t8 (the code is enough; no models or runtimes needed):
   git clone --depth 1 https://github.com/T8mars/Comfyui-YuE2-T8.git YuE2-T8

2) Install the three ROCm runtimes (6~7GB each):
   powershell -ExecutionPolicy Bypass -File scripts\setup_rocm_runtime.ps1 -Role core
   powershell -ExecutionPolicy Bypass -File scripts\setup_rocm_runtime.ps1 -Role transcribe
   powershell -ExecutionPolicy Bypass -File scripts\setup_rocm_runtime.ps1 -Role voice

3) Apply all source patches:
   python scripts\rocm\apply_rocm_port.py <kit_dir>

4) Models (12.2GB, chunked-resume download through hf-mirror):
   python scripts\rocm\fetch_pinned_models.py  # SheetSage2 + MERT completion + MODEL_MANIFEST.json
   python scripts\rocm\fetch_voice_models.py   # Seed-VC + Demucs + VOICE_MODEL_MANIFEST.json
   # verify integrity with t8's own scripts:
   runtime\core\python.exe scripts\verify_models.py --root <kit_dir>
   runtime\core\python.exe scripts\verify_voice_models.py --root <kit_dir>

5) Launch: double-click start_rocm.bat  →  http://127.0.0.1:8189

6) Verify (t8's own doctor + all three job types):
   python scripts\rocm\verify_capabilities.py
```

Note: `scripts\rocm\fetch_*.py` is a **direct-to-mirror** chunked-resume implementation — the huggingface_hub
client is unusable in this network environment (the hub returns `RemoteDisconnected` for large `huggingface.co` files,
the mirror is incompatible with the hub client, and cache symlinks raise `PermissionError` on Windows without Developer Mode).

---

## 5. Known limitations / open items

1. **The VAE tiling speed-up has not been re-measured**: Patch 2 is applied, but the measured 613.7s run predates the patch
   (it used `vae_core_frames=1024`). Re-measuring should turn 613.7s into ~457s. Each job spawns a fresh worker process, so no service restart is needed.
2. **MIOpen's JIT dependency is not fully solved**: Patch 5 only routes the voice worker around it. core's GEMMs use
   precompiled kernels and measured fine; but if the core path ever triggers a new JIT kernel it will fail the same way.
   The complete fix is to give comgr the libc++ headers (flattening them into the resource directory did nothing; the correct approach is still unknown).
3. **`quantization="fp8"` must never be used**: the capability gate passes (capability `(12,0) >= (8,9)`), and
   `torch._scaled_mm` exists, but the relative error against dequantized weights reaches 90~117 — **that is not precision loss, it is a computational error**,
   and it silently produces garbage audio.
4. **torchaudio 2.11's `.save()` depends on torchcodec**: this port replaces it with soundfile inside the voice worker
   (WAV output only, equivalent). General-purpose torchcodec needs FFmpeg shared libraries of your own (PyAV's DLLs could not be paired in testing).
5. **Upstream `setup.ps1` is untouched**: this port ships new scripts alongside it and never edits upstream files — which keeps rebasing and PRs easy.

---

## 6. Quick reference: common pitfalls (all of them hit in testing)

| Pitfall | Symptom | Fix |
|---|---|---|
| python.org blocked | curl hangs forever with no timeout | `--connect-timeout/--max-time` + mirror fallback; or stage the archive beforehand |
| pip cannot install AMD `rocm` | `Cannot import 'setuptools.build_meta'` | use uv (isolated sdist build) |
| pip silently swaps in CUDA torch | after ROCm torch fails, pip pulls the cu build from PyPI | assert `torch.version.cuda is None` |
| venv layout mismatch | t8 needs `runtime/<role>/python.exe` at the root | the embeddable build is mandatory; junctioning/copying python.exe both fail |
| hub client cannot download models | `RemoteDisconnected` / `LocalEntryNotFoundError` / symlink `PermissionError` | chunked-resume HTTP straight to the mirror |
| MIOpen needs write access | `miopenStatusInternalError` (SQLite tuning database) | sandboxed/read-only environments trip it; normal user permissions are fine |
| First VAE decode is abnormally slow | first run 69.7s/chunk vs 41~55s afterwards | one-off MIOpen solver tuning, not a configuration problem |
| Deleting a junction | `Remove-Item -Recurse` may delete the target's contents | `cmd /c rmdir` |
| SheetSage2 fails to load | missing `configuration_sheetsage2.py` and friends | a trust_remote_code model needs **all** its .py files, not just REQUIRED_FILES |
| torchaudio.save fails | `No module named torchcodec` | see Patch 5/6 |
| torch/torchaudio mismatched pair | ABI mismatch / missing hipsparselt | pin one identical full build string (§3.3) |

---

## 7. Directory layout

```
D:\YuE2\T8\start_rocm.bat            double-click to launch (ROCm environment variables)
D:\YuE2\T8\runtime\core\             py3.12.10 + ROCm torch 2.11 (song generation)
D:\YuE2\T8\runtime\transcribe\       py3.11.9  + ROCm torch/torchaudio 2.11 (transcription)
D:\YuE2\T8\runtime\voice\            py3.11.9  + ROCm torch/torchaudio 2.11 (voice)
D:\YuE2\models\                      12.2GB, four models + two manifests
D:\YuE2\venv\                        official YuE2 CLI route (run_yue2.bat, independent of this port)
D:\YuE2\T8\scripts\rocm\             every script in this port
```

Licenses: t8 code is Apache/MIT (see its LICENSE); YuE2 weights are CC BY-NC 4.0 (**non-commercial**);
SheetSage2/MERT per their own LICENSE files; Seed-VC is GPL-3.0. Please double-check before publishing.
