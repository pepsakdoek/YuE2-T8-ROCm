# Working document for upstreaming PRs to t8

> Use this document in the **session that talks to GitHub**.
> Upstream repository: https://github.com/T8mars/Comfyui-YuE2-T8
> This port is based on: **v1.2.2** (commit `a9cc3af081ddf8025f75c4993f128a4554dafe31`, 2026-09-12)
> Local reference checkout: `D:\DSHWEB\_yue_probe\t8\`

---

## 0. Three things to settle before opening a PR (do these first, don't skip them)

1. **Open an issue and talk first; don't just drop a PR on them.** Reasons:
   - Patches 1/3/4/5 are **bug fixes** (they hold on NVIDIA + torch 2.11 as well, see §2.1),
     so the author will most likely want them;
   - Patch 2 is a **behavior change** (the default VAE tile size on 16GB cards moves from 1024 to 512),
     so the author needs to endorse the "adapt to available VRAM" direction;
   - Whether ROCm support lands upstream depends on whether the author wants an AMD branch in CI/docs —
     that is a maintenance-cost question.
2. **Split the PRs**: three separate PRs are recommended instead of one combined PR:
   - PR-A "fix: torch 2.10+ compatibility" (Patches 1/3/4/5; pure bug fixes that benefit CUDA users too)
   - PR-B "feat: device-aware VAE tile size" (Patch 2)
   - PR-C "docs+scripts: AMD ROCm port guide" (new scripts + docs, no upstream code changes)
3. **PR-A must make the CUDA case**: these bugs also reproduce on NVIDIA with torch 2.10/2.11 installed
   (this is our local reasoning plus code facts, **not measured on an NVIDIA machine** — say so honestly
   when opening the issue and ask the maintainers/community to confirm, so it isn't dismissed as an
   "AMD-only problem").

---

## 1. PR-A: fix: torch 2.10+ compatibility (4 issues, all reproducible on NVIDIA too)

> Topic: t8's requirements and vendored code assume torch 2.8; upgrading to torch≥2.9 trips four problems.
> We hit all of them in testing on ROCm/torch 2.11. Each one below is given as symptom / root cause / fix.

### 1.1 `descript-audiotools` crashes on import (blocks Seed-VC startup)

```
AttributeError: module 'torch.distributed' has no attribute 'ReduceOp'
  audiotools/ml/decorators.py:288  op: dist.ReduceOp = dist.ReduceOp.AVG
```
- **Root cause**: demucs → dac → descript-audiotools evaluates `dist.ReduceOp` inside the `Tracker` class
  body; torch≥2.9 turned `torch.distributed` into a lazy module that does not expose `ReduceOp` until a
  process group is initialized.
- **Impact**: `voice_convert` / `reference_cover` cannot start at all.
- **Fix**: inject a sentinel at import time when `dist` has no `ReduceOp` (Seed-VC never initializes
  distributed).
- Location: outside `app/yue2_app`, actually in the **voice runtime's site-packages** (audiotools is a
  transitive dependency of demucs) → the correct upstream fix may be to **pin a compatible version of
  `descript-audiotools`, or add a patch note to the voice requirements**. That is the author's call, which
  is all the more reason to open an issue first.

### 1.2 Seed-VC's CAMPPlus / RMVPE crash on MIOpen (fp32 batchnorm JIT)

```
MIOpen(HIP): Error [Compile] MIOpenBatchNormFwdInferSpatial.cpp
  fatal error: 'type_traits' file not found   →  miopenStatusUnknownError
```
- **Root cause**: for some fp32 kernels MIOpen needs to compile C++ at runtime through HIPRTC; TheRock's
  wheels ship no libc++ headers, so the comgr compile fails.
- **Fix (the one we adopted)**: convert CAMPPlus/RMVPE to fp16 (the other models in `load_models()` already
  call `.half()` anyway); fp16 takes different kernels and needs no JIT. Verified in testing (RTF 0.79).
- **Relevance to NVIDIA users**: if the MIOpen problem does not exist outside TheRock, this one is purely
  AMD; but the inconsistent model precision inside `load_models()` (CAMPPlus alone in fp32) is worth
  unifying regardless.

### 1.3 `torchaudio 2.11`'s `.save()` requires torchcodec

```
ImportError: TorchCodec is required for save_with_torchcodec
```
- **Root cause**: torchaudio 2.11 routes `.save()` through torchcodec; the Windows wheel ships no FFmpeg
  shared libraries.
- **Fix (the one we adopted)**: replace `torchaudio.save` with soundfile inside the voice worker
  (Seed-VC only ever writes WAV, so it is equivalent).
- **Better upstream solution**: add `torchcodec` to the requirements and document the FFmpeg
  shared-library requirement; or have the author switch Seed-VC's save path to soundfile.

### 1.4 `cuda_graph.py`'s assumptions for torch 2.10+

- A comment in `vendor/yue2/cuda_graph.py` states outright "Torch 2.10 is pinned by the package", and the
  backend is chosen by **string-probing** the schema of `torch.ops.aten._flash_attention_forward`.
- **Schemas are shared across backends**: any combination where "the schema has X but that backend's
  implementation does not support X" is misdetected (which is exactly what hit us on ROCm: the schema has
  `seqused_k`, and ROCm's `mha_varlen_fwd` rejects it).
- **Fix**: **actually try it once** after probing (try/except or a capability query) instead of trusting the
  schema alone. This is just as valuable to CUDA users after a torch upgrade.

---

## 2. PR-B: feat: device-aware VAE tile size

> `create_pipe()` in `app/yue2_app/core_worker.py` does not pass `vae_core_frames` through to the
> pipeline, and inside the pipeline it is derived from the single `memory_budget_gib` value
> (`512 if <=12 else 1024`), which silently assumes a 24GB card.

**Measured gain (same request `zh_song.json`, seed 20260917, producing 174.919 s of audio)**:

| | wall | VAE decode | `vae_core_frames` |
|---|---:|---:|---|
| Before | 613.7 s | 313.0 s | 1024 (derived from `memory_budget_gib=23.5`) |
| After | **393.4 s** | **107.0 s** | 512 (adaptive to the card's 15.92 GiB) |
| Gain | **−220.3 s (−35.9%)** | −206 s | — |

That works out to **3.51 s per audio second → 2.25 s per audio second**. After the change it is even faster
than the 423.4 s of running the same request directly through the official CLI.

**Proposed fix**: add to `create_pipe`
```python
vae_core_frames=int(request.get("vae_core_frames") or _default_vae_frames())
```
where `_default_vae_frames()` picks based on the card's actual VRAM (<20GiB → 512, otherwise keep
upstream's 1024). That is a no-op for 24GB NVIDIA users, a 36% speedup for 16GB users, and the API/frontend
can pass it through optionally.

**Side note**: users do not need to tune `memory_budget_gib` themselves — the pipeline automatically clamps
it to `min(budget-2, total-2)`, so on a 16GB card entering 23.5 actually means 13.92 GiB. Only the tile size
genuinely affects speed.

---

## 3. PR-C: docs/scripts: AMD Radeon (ROCm) port guide

- Adds `scripts/rocm/*` and `docs/ROCM_PORT.md` (content taken from `README_ROCM_PORT.md`):
  - a parameterized runtime installer (core/transcribe/voice) that swaps the cu128 index for AMD TheRock
  - `apply_rocm_port.py`, which applies every patch idempotently
  - a direct-mirror model downloader (huggingface_hub is unusable on some networks)
- **Changes no existing upstream file** (upstream setup.ps1 stays as it is; ROCm users install alongside with
  the new scripts)
- The documentation states that model hashes are bit-identical to upstream's pins, and that all four
  capabilities passed on an RX 9070 XT

### 3.1 Two more suggestions to send along (both are PR-B/C in nature)

1. **Stop the in-app self-updater from overwriting hand-modified environments** (our Patch 6). t8's
   "Update to vX" re-extracts the whole package, silently wiping local changes for anyone who has modified
   their kit (not just AMD users). Suggestion: detect local modifications to `runtime/` and the source tree
   before upgrading, or at minimum warn about it explicitly in the docs. In our port we made it always
   report "already up to date".
2. **Device copy should not hardcode NVIDIA** (our Patch 7). `index.html` says
   "All inference runs on your NVIDIA GPU", and the self-check errors in the three workers say
   "NVIDIA CUDA not detected". On HIP builds that copy is misleading (users conclude their hardware is
   unsupported, when in fact the self-check goes through the `torch.cuda` alias and passes on HIP by
   design). Suggest making it neutral ("local GPU" / "CUDA/HIP") or displaying it dynamically based on
   `torch.version.hip`.

### 3.2 Engineering notes for the maintainer (things we tripped over)

- **Patch scripts must preserve the original file's line endings**: on Windows, Python's
  `Path.write_text()` turns `\n` into `\r\n`, so a two-line fix becomes a whole-file diff. Our scripts
  consistently use `open(..., newline="")`.
- **Watch out for multiple anchors when patching vendored code**: a single file may need several changes,
  so the idempotency marker should be a string that appears **only once every change is applied**;
  otherwise later anchors get skipped (we hit this in `inference.py`).

---

## 4. Submission checklist (what the GitHub session needs to prepare)

| Item | Source | Status |
|---|---|---|
| Port report (Chinese) | `D:\DSHWEB\_yue_probe\README_ROCM_PORT.md` | ✅ Written |
| Patch application script | `D:\YuE2\T8\scripts\rocm\apply_rocm_port.py` | ✅ Already in the kit |
| Runtime installer | `D:\YuE2\T8\scripts\setup_rocm_runtime.ps1` | ✅ Already in the kit |
| Verification script | `D:\YuE2\T8\scripts\rocm\verify_capabilities.py` | ✅ |
| Performance/correctness data | `D:\YuE2\PROGRESS.md` §3 | ✅ |
| **Re-measure Patch 2's speedup data** | Done: 613.7 s → **393.4 s** (−35.9%), see §2 | ✅ |
| **Minimal diff file for each patch** (.patch/.diff format) | Generated from apply_rocm_port.py's anchors | ⬜ |
| NVIDIA reproduction evidence (items 1.1/1.3) | Ask the community/author to confirm | ⬜ |

> Note: `D:\YuE2\T8` is an **already-patched** working copy. When opening a PR upstream, the diff base should
> be upstream v1.2.2 (`a9cc3af…`), containing only the five source changes listed above — do not drag runtime
> artifacts such as `runtime/`, `models/`, `outputs/`, `cache/`, or `logs/` into the diff.

---

## 5. Tone and attribution suggestions

- Open by thanking the author: t8's architecture (isolated workers, vendored dependencies, SHA manifest
  verification) is what made this port cheap to build — the three runtimes can be swapped out independently,
  and model integrity checks make "bit-identical weights" provable.
- State the non-commercial restriction explicitly: YuE2 weights are CC BY-NC 4.0.
- Include the machine details (RX 9070 XT / gfx1201 / Windows 11 / ROCm 7.13 wheel) and our four sets of
  measured numbers.
