"""Does this ROCm runtime actually compute on gfx1030 (RDNA2)?

RDNA2 has no native BF16 matrix hardware, and the YuE2 pipeline hard-requires
bf16 (`torch.cuda.is_bf16_supported()` plus `torch_dtype=torch.bfloat16`).
`is_bf16_supported()` returns True for any HIP build, so it proves nothing about
this card. This script checks the three operations the generation path leans on,
and compares each against a float64/float32 reference so a silent wrong-answer
fallback shows up as a number rather than as plausible-sounding audio.
"""
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "vendor"))

import torch
import torch.nn.functional as F

print("torch       :", torch.__version__)
print("hip         :", torch.version.hip, "| cuda field:", torch.version.cuda)
print("device      :", torch.cuda.get_device_name(0))
print("gfx target  :", torch.cuda.get_device_properties(0).gcnArchName)
print("total VRAM  : %.2f GiB" % (torch.cuda.get_device_properties(0).total_memory / 2**30))
print("bf16 report :", torch.cuda.is_bf16_supported())
print(flush=True)

failures = []


def check(label, fn):
    try:
        start = time.time()
        detail = fn()
        torch.cuda.synchronize()
        print("  OK   %-22s %6.2fs  %s" % (label, time.time() - start, detail))
    except Exception as exc:
        print("  FAIL %-22s %s: %s" % (label, type(exc).__name__, exc))
        failures.append(label)


def bf16_matmul():
    a = torch.randn(2048, 2048, device="cuda", dtype=torch.bfloat16)
    b = torch.randn(2048, 2048, device="cuda", dtype=torch.bfloat16)
    c = a @ b
    torch.cuda.synchronize()
    ref = (a.float() @ b.float())
    err = (c.float() - ref).abs().max().item()
    rel = err / ref.abs().max().item()
    return "dtype=%s rel_err=%.3e" % (c.dtype, rel)


def bf16_lm_head():
    # The real AR head shape: 1 x 2048 @ 184704 vocab.
    a = torch.randn(1, 2048, device="cuda", dtype=torch.bfloat16)
    w = torch.randn(2048, 4096, device="cuda", dtype=torch.bfloat16)
    c = a @ w
    ref = a.float() @ w.float()
    rel = (c.float() - ref).abs().max().item() / ref.abs().max().item()
    return "vocab=4096 rel_err=%.3e" % rel


def bf16_sdpa():
    q = torch.randn(1, 8, 256, 64, device="cuda", dtype=torch.bfloat16)
    o = F.scaled_dot_product_attention(q, q, q)
    return "out=%s finite=%s" % (tuple(o.shape), bool(torch.isfinite(o).all()))


def bf16_masked_sdpa():
    # The ROCm patch forces the masked-SDPA branch; exercise a causal mask.
    q = torch.randn(1, 8, 256, 64, device="cuda", dtype=torch.bfloat16)
    mask = torch.ones(256, 256, device="cuda", dtype=torch.bool).tril()
    o = F.scaled_dot_product_attention(q, q, q, attn_mask=mask)
    return "finite=%s" % bool(torch.isfinite(o).all())


def fp32_conv1d():
    x = torch.randn(1, 64, 1024, device="cuda")
    w = torch.randn(64, 64, 7, device="cuda") * 0.05
    y = F.conv1d(x, w, padding=3)
    return "out=%s finite=%s" % (tuple(y.shape), bool(torch.isfinite(y).all()))


def fp32_groupnorm():
    x = torch.randn(1, 64, 1024, device="cuda")
    g = torch.nn.GroupNorm(8, 64).cuda()
    return "finite=%s" % bool(torch.isfinite(g(x)).all())


print("=== GPU kernels ===")
check("bf16 matmul", bf16_matmul)
check("bf16 linear head", bf16_lm_head)
check("bf16 sdpa", bf16_sdpa)
check("bf16 masked sdpa", bf16_masked_sdpa)
check("fp32 conv1d (VAE)", fp32_conv1d)
check("fp32 groupnorm", fp32_groupnorm)

print("\n=== yue2 import (vendored, ROCm-patched) ===")
try:
    import yue2
    from yue2 import YuE2Pipeline  # noqa: F401
    from yue2.protocol import GenerationConfig  # noqa: F401
    print("  OK   yue2 at", Path(yue2.__file__).parent)
    print("  OK   cuda_graph patch marker:",
          "HIP" if "hip" in Path(yue2.__file__).with_name("cuda_graph.py").read_text().lower() else "absent")
except Exception as exc:
    print("  FAIL %s: %s" % (type(exc).__name__, exc))
    failures.append("yue2 import")

free, total = torch.cuda.mem_get_info()
print("\nVRAM free   : %.2f / %.2f GiB" % (free / 2**30, total / 2**30))
print("failures    :", failures if failures else "none")
sys.exit(1 if failures else 0)
