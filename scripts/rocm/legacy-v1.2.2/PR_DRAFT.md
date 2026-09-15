# Working document for filing a PR with t8 upstream

> Target session: the **session that talks to GitHub** uses this document.
> Upstream repository: https://github.com/T8mars/Comfyui-YuE2-T8
> This port is based on: **v1.2.2** (commit `a9cc3af081ddf8025f75c4993f128a4554dafe31`, 2026-09-12)
> Local reference checkout: `D:\DSHWEB\_yue_probe\t8\`

---

## 0. Three decisions to make before filing the PR (do them first, don't skip them)

1. **Open an issue first and talk it through; do not just drop a PR.** Reasons:
   - Patches 1/3/4/5 are **bug fixes** (they hold on NVIDIA + torch 2.11 too, see §2.1),
     so the author will most likely accept them;
   - Patch 2 is a **behavior change** (default VAE tiling on a 16GB card moves from 1024 to 512), and it needs the author to endorse the "adapt to VRAM" direction;
   - Whether ROCm support lands upstream depends on whether the author wants an AMD branch in CI/docs — that is a maintenance-cost question.
2. **Split the PRs**: 3 separate PRs are recommended rather than one combined one:
   - PR-A "fix: torch 2.10+ compatibility" (Patches 1/3/4/5, pure bug fixes, CUDA users benefit too)
   - PR-B "feat: device-aware VAE tile size" (Patch 2)
   - PR-C "docs+scripts: AMD ROCm port guide" (new scripts + docs, no upstream code changes)
3. **PR-A must argue from CUDA**: these bugs also reproduce on NVIDIA with torch 2.10/2.11 installed
   (that is local theoretical reasoning plus code facts on our side, **with no NVIDIA hardware testing** — say so honestly in the issue,
   and ask the maintainer/community to confirm, so it is not rejected as an "AMD-only problem").

---

## 1. PR-A: fix: torch 2.10+ compatibility (4 issues, all reproducible on NVIDIA too)

> Subject: t8's requirements and vendored code assume torch 2.8; upgrading to torch≥2.9 runs into 4 problems.
> We hit all of them in testing on ROCm/torch 2.11. Each one below is given as "symptom / root cause / fix".

### 1.1 `descript-audiotools` crashes on import (blocks Seed-VC startup)

```
AttributeError: module 'torch.distributed' has no attribute 'ReduceOp'
  audiotools/ml/decorators.py:288  op: dist.ReduceOp = dist.ReduceOp.AVG
```
- **Root cause**: demucs → dac → descript-audiotools evaluates `dist.ReduceOp` in the `Tracker` class body;
  torch≥2.9 turned `torch.distributed` into a lazy module that does not expose `ReduceOp` before the process group is initialized.
- **Impact**: `voice_convert` / `reference_cover` cannot start at all.
- **Fix**: inject a sentinel at import time when `dist` has no `ReduceOp` (Seed-VC never initializes distributed).
- File: outside `app/yue2_app`; it is actually in the **voice runtime's site-packages** (audiotools is a
  transitive dependency of demucs) → the correct upstream fix may be to **pin a compatible version of `descript-audiotools`, or to add
  a patch note in the voice requirements**. That is the author's call, which is all the more reason to open an issue first.

### 1.2 Seed-VC's CAMPPlus / RMVPE crash on MIOpen (fp32 batchnorm JIT)

```
MIOpen(HIP): Error [Compile] MIOpenBatchNormFwdInferSpatial.cpp
  fatal error: 'type_traits' file not found   →  miopenStatusUnknownError
```
- **Root cause**: for some fp32 kernels MIOpen needs HIPRTC to compile C++ at runtime; TheRock's wheel
  ships no libc++ headers, so comgr fails to compile.
- **Fix (the one we took)**: convert CAMPPlus/RMVPE to fp16 (the other models in `load_models()` already
  call `.half()`), and fp16 takes a different kernel that needs no JIT. Verified in testing (RTF 0.79).
- **Relevance to NVIDIA users**: if this is purely a TheRock-specific MIOpen issue, then this one is AMD-only;
  but the inconsistent model precision in `load_models()` (CAMPPlus alone in fp32) is itself worth unifying.

### 1.3 `torchaudio 2.11`'s `.save()` requires torchcodec

```
ImportError: TorchCodec is required for save_with_torchcodec
```
- **Root cause**: torchaudio 2.11 routes `.save()` through torchcodec; the Windows wheel ships no FFmpeg shared libraries.
- **Fix (the one we took)**: replace `torchaudio.save` with soundfile inside the voice worker
  (Seed-VC only writes WAV, so it is equivalent).
- **A better upstream solution**: add `torchcodec` to requirements and document the FFmpeg shared-library requirement;
  or have the author switch Seed-VC's saving to soundfile.

### 1.4 `cuda_graph.py`'s assumptions about torch 2.10+

- A comment in `vendor/yue2/cuda_graph.py` says outright "Torch 2.10 is pinned by the package",
  and it picks a backend with **string probing** of the `torch.ops.aten._flash_attention_forward` schema.
- **Schemas are shared across backends**: any combination where "the schema has X but that backend's implementation does not support X" is misjudged
  (we hit exactly that on ROCm: the schema has `seqused_k` and ROCm's `mha_varlen_fwd` rejects it).
- **Fix**: after probing, **actually try it once** (try/except or a capability query) instead of trusting the schema.
  That is just as valuable to CUDA users after a torch upgrade.

---

## 2. PR-B: feat: device-aware VAE tile size

> `create_pipe()` in `app/yue2_app/core_worker.py` does not pass `vae_core_frames` through to
> the pipeline, and the pipeline derives it internally from the single `memory_budget_gib` value (`512 if <=12 else 1024`),
> which implicitly assumes a 24GB card. Measured on the same 175s song on a 16GB card:
> - `vae_core_frames=1024`: VAE decode **313s** (613.7s total)
> - `vae_core_frames=512` : VAE decode **~156s** (expected total ~457s, **about 25% faster**)
> (tiling benchmark, same 60s latent: 512→101.6s / 1024→230.9s / full→285.0s)

**Proposed fix**: add to `create_pipe`
```python
vae_core_frames=int(request.get("vae_core_frames") or _default_vae_frames())
```
where `_default_vae_frames()` picks by the card's actual VRAM (<20GiB → 512, otherwise keep upstream's 1024).
Zero change for 24GB NVIDIA users; a 25% speed-up for 16GB users; the API/frontend can pass it through optionally.

**To do (mandatory before submitting)**: re-measure on our machine to obtain the 457s figure
(the patch is applied, and each job spawns a fresh worker process, so it takes effect immediately).

---

## 3. PR-C: docs/scripts: AMD Radeon (ROCm) port guide

- Add `scripts/rocm/*` and `docs/ROCM_PORT.md` (content taken from `README_ROCM_PORT.md`):
  - A parameterized runtime installer (core/transcribe/voice) that swaps the cu128 index for AMD TheRock
  - `apply_rocm_port.py` applies every patch idempotently
  - A direct-to-mirror model downloader (huggingface_hub is unusable on some networks)
- **No existing upstream file is modified** (upstream setup.ps1 stays as it is, and ROCm users install the new scripts alongside it)
- The docs state: the model hashes match the upstream pin bit for bit, and all four capabilities passed testing on an RX 9070 XT

---

## 4. Submission checklist (what the GitHub session needs to prepare)

| Item | Source | Status |
|---|---|---|
| Port report (Chinese) | `D:\DSHWEB\_yue_probe\README_ROCM_PORT.md` | ✅ written |
| patch application script | `D:\YuE2\T8\scripts\rocm\apply_rocm_port.py` | ✅ already in the kit |
| runtime installer | `D:\YuE2\T8\scripts\setup_rocm_runtime.ps1` | ✅ already in the kit |
| verification script | `D:\YuE2\T8\scripts\rocm\verify_capabilities.py` | ✅ |
| performance/correctness data | `D:\YuE2\PROGRESS.md` §3 | ✅ |
| **Re-measure Patch 2's 457s figure** | run one generation | ⬜ |
| **Minimal diff file for each patch** (.patch/.diff format) | generated from apply_rocm_port.py's anchors | ⬜ |
| NVIDIA reproduction evidence (items 1.1/1.3) | ask the community/author to confirm | ⬜ |

> Note: `D:\YuE2\T8` is a working copy that is **already patched**. When filing the upstream PR, the diff base must be
> upstream v1.2.2 (`a9cc3af…`) and contain only the 5 source changes listed above — do not drag `runtime/`,
> `models/`, `outputs/`, `cache/`, `logs/` and other runtime artifacts into the diff.

---

## 5. Suggested tone and attribution

- Thank the author up front: t8's architecture (isolated workers, vendored dependencies, SHA manifest verification) is what let this port
  happen cheaply — the three runtimes can be swapped independently, and model integrity checking makes "bit-identical weights" provable.
- State the non-commercial restriction clearly: YuE2 weights are CC BY-NC 4.0.
- Attach the machine details (RX 9070 XT / gfx1201 / Windows 11 / ROCm 7.13 wheel) and our four measured results.
