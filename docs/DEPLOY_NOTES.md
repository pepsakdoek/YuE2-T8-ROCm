# YuE2 on AMD RX 9070 XT — Deployment Notes

Test environment: Windows 11 (build 26200) / AMD Radeon RX 9070 XT 16GB (gfx1201) /
native Windows ROCm, **no CUDA, no Triton, no flash-attn**.

## Conclusion

YuE2 **generates songs perfectly well** on this card. The "Linux + NVIDIA + 24GB VRAM"
stated in the official README is a recommended starting point, not a hard requirement —
that 24GB figure is nothing more than the default value of the `memory_budget_gib`
parameter in the code, and `pipeline.py` clamps it automatically to the card's real VRAM:

```python
budget = min((self.memory_budget_gib - 2) * 2**30, total - 2 * 2**30)
```

On a 16GB card the budget is clamped to 13.92 GiB, which measures as sufficient.

## Three pitfalls you have to know about

### 1. CUDA graph misdetects the backend on ROCm and crashes (patched)

`src/yue2/cuda_graph.py` branches on `device.type == "cuda"`, and under ROCm that value is
simply true. It selects the flash backend by checking only whether `seqused_k` appears in
the ATen **schema**, **without regard for what the backend can actually implement** — and
the schema is shared across backends. Measured:

```
RuntimeError: [ROCm] mha_varlen_fwd: seqused_k must be nullopt
```

Side note: in this ROCm build `torch.backends.cudnn.is_available()` returns **True**, but
`CUDNN_ATTENTION` actually raises a RuntimeError, so the cudnn fallback is not an option
either.

**Patch** (already applied to `YuE/src/yue2/cuda_graph.py` in this directory): when
`attention_backend == "auto"`, force masked SDPA on HIP. Do **not** instead pass
`seqused_k=None` to sidestep it — variable-length FA would then attend to unused future
cache slots and compute wrong results.

Masked SDPA inside a CUDA graph has been verified to capture successfully, to replay
correctly in response to in-place position updates, and to differ from eager by
**0.000e+00**.

### 2. Models must be fetched directly from hf-mirror, and huggingface_hub cannot be used

| Target | Result |
|---|---|
| Fetching the 6.76GB weights from `huggingface.co` | ❌ `RemoteDisconnected` (small API requests go through, large files get reset) |
| Fetching weights from `hf-mirror.com` | ✅ HTTP 206, ~5 MiB/s on a single stream, 60 MiB/s peak with 6 parallel streams |

But `huggingface_hub` is incompatible with the mirror (`LocalEntryNotFoundError` at the
metadata layer), and on Windows without Developer Mode creating cache symlinks raises
`PermissionError`.
**Solution**: bypass the hub and use plain HTTP ranged resumption (see the deployment
script `mirror_download_v2.py`). The 6.76GB main weights finished downloading in
9.2 minutes.

### 3. It cannot be installed into the ComfyUI portable package

- ComfyUI ships `transformers 5.3.0` while YuE2 pins `4.57.6`; YuE2 also uses older APIs
  such as `torch_dtype=` (renamed `dtype=` in v5).
- That community ComfyUI node (`smthemex/ComfyUI_YuE`) wraps **YuE v1, not YuE2**; it also
  hardcodes `attn_implementation="flash_attention_2"` (with no fallback), enables mmgp and
  `torch.compile(max-autotune)` by default, and its int8/exllamav2 quantization paths are
  all unusable on ROCm.

## Installation essentials (for reproduction)

```powershell
# 1. venv (upstream recommends 3.12)
& 'D:\anaconda3\python.exe' -m venv D:\YuE2\venv
$py = 'D:\YuE2\venv\Scripts\python.exe'
& $py -m pip install --upgrade pip uv

# 2. AMD TheRock ROCm (NOT the CUDA build from PyPI!)
& $py -m uv pip install --extra-index-url https://rocm.nightlies.amd.com/v4/whl/ --pre "rocm[libraries,device-gfx1201]"
& $py -m uv pip install --index-url https://rocm.nightlies.amd.com/v2/gfx120X-all/ torch

# 3. YuE2 dependencies (never let these touch torch)
& $py -m uv pip install transformers==4.57.6 huggingface-hub==0.36.2 safetensors==0.7.0 `
    tiktoken==0.12.0 "numpy==2.2.6" soundfile==0.13.1 accelerate==1.13.0

# 4. Critical: --no-deps, otherwise pip overwrites the ROCm torch with PyPI's torch==2.10.0
& $py -m uv pip install --no-deps --editable D:\YuE2\YuE
```

Verify after installing:

```
torch 2.11.0+rocm7.13.0a20260416   hip 7.2.0
transformers 4.57.6                numpy 2.2.6
available True                     bf16 True
device AMD Radeon RX 9070 XT       yue2 import OK
```

## State of the official front end

The official repository has **no local WebUI**. What it does provide is:
- CLI: `yue2 generate --request examples/song.json --output outputs/song`
- A staged Python API: `plan() → generate_semantic() → synthesize() → decode()`
- An official agent skill: `skills/yue2-music/SKILL.md` (usable directly by any agent that supports SKILL.md)
- An online demo: https://map-yue2.github.io/ (not local)

The community project `T8mars/Comfyui-YuE2-T8` does come with its own local WebUI
(`127.0.0.1:8189`, no ComfyUI required, using isolated workers to avoid polluting the
ComfyUI environment). But its install script pins all three embedded Python environments
to `--index-url .../whl/cu128`, which leaves **no installation path on AMD** — it has to be
rewritten against the ROCm indexes given above; the project also has zero AMD support and
zero AMD community feedback, having been validated only on an RTX 5090 Laptop 24GB. Its
`torch.cuda.is_available()` / BF16 assertions happen to pass on ROCm, and its default
`backend="torch-eager"` dodges the CUDA graph pitfall as well — the only genuine barrier is
the cu128 wheels.

## Measured performance (16GB / ROCm)

The same `city_lights` example (the example lyrics end naturally; none of the runs were
truncated), full-length comparison across both backends:

| Stage | `torch` (CUDA graph) | `torch-eager` |
|---|---:|---:|
| Song duration | 63.68s | 59.96s |
| ABC score planning | 28.5s (18.5 tok/s, 528 tok) | 24.4s (22.1 tok/s, 540 tok) |
| Semantic token generation | 111.3s (**14.3 tok/s**, 1593 tok) | 60.7s (**24.7 tok/s**, 1500 tok) |
| NAR flow matching | 6.36s (32 steps) | 5.94s (32 steps) |
| VAE audio decoding | 165.6s / 4 chunk = 41.4s | 165.8s / 3 chunk = 55.3s |
| **e2e total** | 321.3s | **267.9s** |
| Process exit code | 1 | **0** |

Normalized: graph 5.05 seconds per second of audio, eager 4.47 seconds per second of audio
— **eager is about 12% faster**, and it exits cleanly. So the default on this machine is
`--backend torch-eager`.

### Why CUDA graph is actually slower on long sequences

`GraphAR` sets `capacity = max(len(prefix)) + max_tokens`, and the masked SDPA branch
**computes attention over the whole capacity at every step**. The upstream flash path
escapes this because it uses `seqused_k` to tell FA the real effective length — **and that
is exactly the argument ROCm rejects**. Hence:

- Short sequences (max_tokens=600, capacity≈1030): graph 46.3 tok/s vs eager 25.0 → graph is 1.85× faster
- Long sequences (max_tokens=9000, capacity≈9669): graph 14.3 tok/s vs eager 24.7 → graph is 42% slower

Conclusion: **graph only pays off at small capacity**; under production parameters eager
wins.

### An easy pitfall to misread: the first VAE decode is especially slow

The first VAE decode run took 139.3s (2 chunk, 69.7s/chunk), whereas the same work later
takes 41–55s/chunk. This is not a backend difference but **MIOpen paying its one-off
tuning cost for convolution solvers on first use** (cached to disk afterwards). While
debugging, do not mistake a slow first run for a configuration problem.

The `MIOpen(HIP): Warning [IsEnoughWorkspace] Solver <GemmFwdRest>, workspace required:
1816543232, provided ptr: 0x0000000000000000 size: 0` line that keeps appearing in the logs
is a benign solver-selection/workspace warning; measurements show it does not affect the
results, and it can be tuned further with `MIOPEN_FIND_MODE`.

### About exit code 1

With `--backend torch` the process crashes during interpreter teardown — **after every
artifact has been written out and hash-verified** — and returns 1. `result.json` still has
`status` set to `complete` and `audio.flac` is complete and playable, so this is purely a
shutdown issue, not an inference failure. `torch-eager` shows no such problem. Controlled
experiments confirmed that plain torch / bf16 matmul / SDPA / CUDA graph each run on their
own with `exit 0`; only this combination of paths triggers it.

## Language support: one set of weights, two languages (no extra model for Chinese)

The YuE2-3B model card frontmatter is simply `language: [zh, en]` — **a single set of
weights supports both Chinese and English**.

⚠️ **Do not carry over the YuE v1 experience**: v1 really did ship language-specific
weights (en / zh / jp-kr, e.g. `YuE-s1-7B-anneal-zh-cot`), but **YuE2 published only one
set of weights, `m-a-p/YuE2-3B`, with no language branches**. The copy already downloaded
on this machine is the complete set, and no Chinese model needs to be fetched.

Language is declared through tags in the `style` field; there is no separate language
parameter:

```json
{"style": "Mandarin, warm piano, acoustic pop, female vocal, 84 BPM", "lyrics": "..."}
```

Corroborating evidence:
- The official CLI's own built-in default request is a Chinese song (`src/yue2/cli.py:108`,
  with a `style` of `"Mandarin, warm piano, acoustic pop, female vocal"`).
- The tokenizer has a dedicated table for CJK: measured, 7 Chinese characters → 6 tokens
  (≈1 token per character), with token IDs landing in the 99xxx–119xxx range; Japanese and
  Korean likewise have their own range (12xxxx). English, by contrast, needs 25 characters
  to reach 6 tokens.
- The model card demo includes a `Mandarin funk / nu-disco` entry, and the official agentic
  demo is likewise "from Mandarin pop to English jazz".

## Room for optimization (measured)

### VAE decode chunk size: 512 is already the sweet spot

The same 1499-frame (60s of audio) latent, running decode only:

| tiles | core_frames | Decode time | Peak VRAM | RMS |
|---:|---:|---:|---:|---:|
| 12 | 128 | 104.0s | 1.27 GB | 0.0942 |
| 6 | 256 | 161.6s | 1.88 GB | 0.0942 |
| **3** | **512** | **101.6s** | 3.11 GB | 0.0942 |
| 2 | 1024 | 230.9s | 5.50 GB | 0.0942 |
| 1 | full (no chunking) | 285.0s | 7.70 GB | 0.0942 |

All five RMS values are identical, so this is purely a speed difference with no effect on
audio quality.

**Note that the upstream default is slow on this card**: `vae_core_frames` becomes **1024**
when `memory_budget_gib > 12` (a value chosen for 24 GB cards), which on this machine is
2.3× slower than 512. The `yue2_run.py` in this directory pins it to 512.

The non-monotonic behavior (256 is worse than both 128 and 512) shows that the dominant
factor is **MIOpen picking solvers by tensor shape**, not a clean O(T²) relationship. So
changing the chunk size is a gamble on solver selection; 512 is already a good slot and
needs no more tuning. If you want to squeeze further, try `MIOPEN_FIND_MODE=3` +
`MIOPEN_FIND_ENFORCE=3` (ComfyUI's "Tuning mode"; slow on the first run, cache-backed
afterwards).

### FP8 quantization: the gate passes, but the results are wrong — never enable it

The gate in `quantization.py` is `torch.cuda.get_device_capability(device) >= (8, 9)`, and
this machine reports **(12, 0)** ⇒ **the gate passes**, and `torch._scaled_mm` exists too,
so everything looks normal.

But measured (four shapes, including the real 2048 hidden / 184704 vocab):

| Shape | vs dequantized reference |
|---|---:|
| M=16 K=2048 N=512 | 99.99863 |
| M=16 K=2048 N=2048 | 109.82619 |
| M=1 K=2048 N=184704 (lm_head) | 116.88484 |
| M=1500 K=2048 N=2048 (prefill) | 89.68730 |

The reference is the **dequantized weights**, which rules out FP8 quantization error and
tests only whether `_scaled_mm` computes correctly. A relative error of roughly 90–117
means the output magnitude is entirely wrong — **this is not precision loss, it is a
computational error**. So enabling `quantization="fp8"` on ROCm **silently produces
garbage audio**.

(The first probe gave a false reading because I had written the weights as
`wt.t().contiguous().t()` — a double transpose equals `wt`, so I was comparing `a @ w`
against `a @ w.t()` and the errors were naturally absurd. The conclusion above was only
confirmed after that was fixed.)

### Environment detail: MIOpen needs write permission

MIOpen writes its conv solver tuning results into a SQLite database. If the process lacks
write permission for that directory, it fails outright:

```
MIOpen Error: sqlite_db.cpp:224: Internal error while accessing SQLite database:
unable to open database file
RuntimeError: miopenStatusInternalError
```

Normal operation (running `run_yue2.bat` with ordinary user permissions) never hits this;
but running YuE2 in any restricted sandbox or read-only environment will — the signature is
conv1d throwing `miopenStatusInternalError`.



## Measured generation speed (Patch 2 before/after)

The same request (`zh_song.json`, seed 20260917, producing 174.919 s of audio):

| Run | wall | VAE decode | vae_frames |
|---|---:|---:|---|
| T8 before Patch 2 | 613.7 s | 313.0 s | 1024 |
| T8 after Patch 2 | **393.4 s** | **107.0 s** | **512** |
| Official CLI run directly | 423.4 s | 155.8 s | 512 |

**−220.3 s (−35.9%)**, and the gap lies almost entirely in VAE chunking → the diagnosis
holds. Normalized: 3.51 → 2.25 s per second of audio.

⚠️ **Cross-day comparisons drift systematically**: with identical 512 chunking, the earlier
VAE decode took 155.8 s and this one 107.0 s (most likely MIOpen's solver tuning cache
being persisted to disk on first run). So only same-day, same-session A/B runs are
reliable, and when comparing against historical numbers leave ~15% of headroom. This also
re-confirms the "first VAE decode is abnormally slow" item.

## Two rules for patch scripts (learned the hard way)

**1. The original file's line endings must be preserved.** Early versions wrote back with
Python's `Path.write_text()`, which on Windows translates `\n` into `\r\n` — turning a
2-line fix into a whole-file diff (a screenful of changes in git).
Measured: `transcribe_worker.py` grew from 4836 B to 4957 B (+121 = 15 B of new text + 106
extra CRs). After switching uniformly to `open(..., newline="")` for reading and writing,
replayed output is **byte-for-byte identical** to the measured kit (identical SHA256 for
7 files).

**2. With multiple anchors in one file, the idempotency marker must be a signature string
that only appears once everything has been changed.**
This bit us in `vendor/seed-vc/inference.py`: the marker was initially patch A's comment,
so when patch B was added later the script decided the file was "already patched" and
skipped it wholesale → B was never applied. Switching to a marker built from B's signature
string fixed it.

## .bat files flash-closing (quit on double-click) — the ASCII iron rule

**Symptom**: double-clicking run_yue2.bat / start_rocm.bat closes the window instantly, or
it exits after a screenful of errors.

**Root cause**: the bat file is **saved as UTF-8 and contains Chinese**. cmd slices the
batch file line by line using the current code page; although chcp 65001 takes effect on
line 2, cmd's line reader **misaligns** on multibyte characters and splits a line down the
middle — REM ...kernels... is split into REM + kernels..., and the latter is executed as a
command:
`
'kernels' is not recognized as an internal or external command
'IMENTAL' is not recognized ...        ← EXPERIMENTAL was cut in half
'目录>' / '义歌词' is not recognized   ← UTF-8 Chinese got mangled ('目录' = "directory", '义歌词' = leftover fragment of "semantic lyrics")
`

**Iron rule: put nothing but ASCII in .bat files.** Move Chinese messages into Python
output (Python handles UTF-8 fine). Both launchers have been rewritten as pure ASCII
(run_yue2.bat, start_rocm.bat); before deploying, validate with (number of bytes >127 in
the file) == 0.

**Another related pitfall**: Windows locks **a .bat file that is running** — a window
sitting at pause after a double-click makes that file impossible to overwrite (Copy-Item:
Access denied). Close that window or kill the cmd process before deploying.
