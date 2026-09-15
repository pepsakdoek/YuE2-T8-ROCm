#!/usr/bin/env python3
"""Run the upstream YuE2 example song on the ROCm runtime.

The request is the stock example from the original repository
(https://github.com/multimodal-art-projection/YuE): ``examples/song.json``,
id ``city_lights`` -- English warm piano pop, seed 831001, ``cot="full"``.
The weights are the official ``m-a-p/YuE2-3B`` + ``m-a-p/YuE2-Vae`` releases.

Differences from ``examples/generate.py``:

* ``yue2`` is imported from ``vendor/yue2`` -- the ROCm-patched copy this kit
  ships -- not from any installed wheel. Running from the repo you cloned is
  what makes the port apply.
* Weights are resolved from local directories (models/YuE2-3B, models/YuE2-Vae)
  instead of the Hugging Face hub.
* Defaults are the ones measured good on a 16 GB Windows ROCm card:
  ``--backend torch-eager`` (faster than the CUDA-graph path on long sequences
  and it exits cleanly), ``--vae-core-frames 512`` (the upstream 1024 default is
  sized for 24 GB), ``--memory-budget-gib 16`` (the pipeline clamps the usable
  budget to min(16-2, total-2) GiB).

Usage:
    runtime\\python.exe scripts\\rocm\\run_example_song.py --output outputs\\city_lights
"""
import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# The vendored, ROCm-patched yue2 must win over anything site-packages holds.
sys.path.insert(0, str(ROOT / "vendor"))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--request", type=Path, default=ROOT / "YuE" / "examples" / "song.json",
                        help="request JSON with style/lyrics/cot/seed")
    parser.add_argument("--output", type=Path, required=True, help="output directory")
    parser.add_argument("--model", type=Path, default=ROOT / "models" / "YuE2-3B")
    parser.add_argument("--vae", type=Path, default=ROOT / "models" / "YuE2-Vae")
    parser.add_argument("--style", help="override the request's style prompt")
    parser.add_argument("--lyrics-file", type=Path, help="override lyrics from a .txt file")
    parser.add_argument("--cot", choices=("full", "melody", "off"))
    parser.add_argument("--seed", type=int)
    parser.add_argument("--ode-steps", type=int, default=32)
    parser.add_argument("--vae-core-frames", type=int, default=512)
    parser.add_argument("--memory-budget-gib", type=float, default=16.0)
    parser.add_argument("--backend", choices=("torch", "torch-eager"), default="torch-eager")
    parser.add_argument("--offload-ar", action="store_true",
                        help="offload AR weights to CPU during the NAR stage")
    parser.add_argument("--force", action="store_true",
                        help="reuse a non-empty output directory")
    args = parser.parse_args(argv)

    if not args.request.is_file():
        parser.error("no request file at %s" % args.request)
    for label, directory in (("model", args.model), ("vae", args.vae)):
        weights = directory / "model.safetensors"
        if not weights.is_file():
            parser.error("missing %s weights: %s\n  fetch them with "
                         "scripts\\rocm\\fetch_example_models.ps1" % (label, weights))
    if args.output.exists() and any(args.output.iterdir()) and not args.force:
        parser.error("%s is not empty; pass --force to overwrite" % args.output)

    import torch
    if not torch.cuda.is_available():
        return _fail("No ROCm/HIP device visible to PyTorch. "
                     "Is this a HIP build and is the GPU supported?")
    props = torch.cuda.get_device_properties(0)
    print("torch      :", torch.__version__)
    print("hip        :", torch.version.hip, "| cuda field:", torch.version.cuda)
    print("device     :", torch.cuda.get_device_name(0))
    print("gfx target :", getattr(props, "gcnArchName", "?"))
    print("total VRAM : %.2f GiB" % (props.total_memory / 2**30))
    print("bf16       :", torch.cuda.is_bf16_supported())

    from yue2 import YuE2Pipeline
    from yue2.protocol import GenerationConfig
    import yue2
    print("yue2       :", Path(yue2.__file__).parent)

    request = json.loads(args.request.read_text(encoding="utf-8"))
    if args.style:
        request["style"] = args.style
    if args.lyrics_file:
        request["lyrics"] = args.lyrics_file.read_text(encoding="utf-8")
    if args.cot:
        request["cot"] = args.cot
    if args.seed is not None:
        request["seed"] = args.seed

    print("song id    :", request.get("id", "(none)"))
    print("style      :", request["style"])
    print("cot/seed   :", request.get("cot", "full"), "/", request.get("seed"))
    print("backend    : %s | ode_steps: %d | vae_core_frames: %d"
          % (args.backend, args.ode_steps, args.vae_core_frames))
    print(flush=True)

    start = time.time()
    with YuE2Pipeline.from_pretrained(
            str(args.model), vae=str(args.vae), device="cuda", backend=args.backend,
            memory_budget_gib=args.memory_budget_gib,
            vae_core_frames=args.vae_core_frames, offload_ar=args.offload_ar,
            generation_config=GenerationConfig(ode_steps=args.ode_steps)) as pipe:
        song = pipe(**request)
        result = song.save_artifacts(args.output)

    elapsed = time.time() - start
    print(json.dumps({"status": result["status"], "truncated": result["truncated"],
                      "sample_rate": result["sample_rate"],
                      "audio_seconds": round(result["audio_seconds"], 2),
                      "timing": result["timing"]}, indent=2, ensure_ascii=False))
    print("audio      :", args.output / "audio.flac")
    print("total      : %.1f s (%.2f s per audio second)"
          % (elapsed, elapsed / max(result["audio_seconds"], 1e-9)))
    return 1 if any(result["truncated"].values()) else 0


def _fail(message: str) -> int:
    print("ERROR: " + message, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
