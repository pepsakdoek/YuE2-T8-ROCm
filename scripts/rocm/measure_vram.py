#!/usr/bin/env python3
"""Measure the resident VRAM floor of the generation path.

Answers "how much VRAM do I actually need" with numbers instead of repeating
upstream's 24 GB recommendation. Reports allocation after each component
becomes resident, so the total is attributable:

    pipeline init        -> config, tokenizer, weight hashing (host memory)
    AR/NAR model loaded  -> the 3B backbone in bf16
    VAE decoder loaded   -> the fp32 decode path

Peak activations during AR/NAR/VAE are not covered here -- they are transient
and depend on sequence length -- but the resident floor is what decides whether
a card is viable at all.

Usage:
    runtime\\python.exe scripts\\rocm\\measure_vram.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "vendor"))

import numpy as np
import torch

GIB = 2 ** 30


def report(label):
    torch.cuda.synchronize()
    print("  %-30s allocated %6.2f GiB   reserved %6.2f   peak %6.2f"
          % (label, torch.cuda.memory_allocated() / GIB,
             torch.cuda.memory_reserved() / GIB,
             torch.cuda.max_memory_allocated() / GIB))


from yue2 import YuE2Pipeline  # noqa: E402
from yue2.modeling_vae import YuE2VAE  # noqa: E402

total_gib = torch.cuda.get_device_properties(0).total_memory / GIB
print("device: %s  %.2f GiB total" % (torch.cuda.get_device_name(0), total_gib))
print()

pipe = YuE2Pipeline(str(ROOT / "models" / "YuE2-3B"), str(ROOT / "models" / "YuE2-Vae"),
                    device="cuda", memory_budget_gib=16.0, backend="torch-eager",
                    vae_core_frames=512, progress=False)
report("pipeline constructed")

pipe._load_model()
report("AR/NAR backbone resident")

vae = YuE2VAE.from_pretrained(str(ROOT / "models" / "YuE2-Vae"),
                              decoder_only=True, device=pipe.device)
report("VAE decoder resident")

# The latent for the example song, for scale: 64 channels x T frames, fp32.
latent_frames = 1668
print()
print("  latent for a 66.7 s song        %6.2f MiB (64 x %d fp32)"
      % (64 * latent_frames * 4 / 2 ** 20, latent_frames))
print("  decoded audio (48 kHz stereo)   %6.2f MiB (%d frames, float32 x2)"
      % (latent_frames * 1920 * 4 * 2 / 2 ** 20, latent_frames * 1920))
print()
print("resident floor (backbone + VAE)  %6.2f GiB"
      % (torch.cuda.max_memory_allocated() / GIB))
print("configured budget               %6.2f GiB" % pipe.memory_budget_gib)
budget_gib = min(pipe.memory_budget_gib - 2, total_gib - 2)
print("budget the pipeline enforces    %6.2f GiB  (min(budget-2, total-2))" % budget_gib)
print()
print("note: decode() moves the backbone to CPU before the VAE loads, so the")
print("      decode peak is max(VAE, backbone) -- not their sum. The figure above")
print("      is a deliberate over-estimate that keeps both resident at once.")
