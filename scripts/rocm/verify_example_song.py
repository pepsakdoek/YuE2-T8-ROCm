#!/usr/bin/env python3
"""Verify a generated example song the way the pipeline defines correctness.

Three independent checks, so "it finished" is not confused with "it worked":

1. ``yue2.storage.verify_result`` -- re-hashes every artifact listed in
   result.json and re-checks status/identity.
2. Audio statistics from ``soundfile`` -- duration, rate, channels, peak, RMS,
   finiteness and DC offset. A silent or NaN-filled decode still exits 0, so
   these numbers are the actual evidence audio came out.
3. The symbolic plan -- prints the generated ABC score that the audio realizes.

Usage:
    runtime\\python.exe scripts\\rocm\\verify_example_song.py outputs\\city_lights
"""
import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "vendor"))

import numpy as np
import soundfile as sf

from yue2.storage import verify_result


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--abc-lines", type=int, default=28)
    args = parser.parse_args(argv)

    directory = args.directory.resolve()
    if not (directory / "result.json").is_file():
        print("no result.json in %s" % directory)
        return 2

    failures = []

    print("=== 1. artifact integrity (sha256 vs result.json) ===")
    try:
        result = verify_result(directory)
        print("  OK   status=%s  artifacts=%d verified"
              % (result["status"], len(result["artifacts"])))
        print("  truncated :", result["truncated"])
        print("  identity  :", result["identity"][:16] + "...")
    except Exception as exc:
        print("  FAIL %s: %s" % (type(exc).__name__, exc))
        failures.append("integrity")
        return 1

    print("\n=== 2. audio ===")
    path = directory / "audio.flac"
    audio, rate = sf.read(str(path), always_2d=True, dtype="float64")
    frames, channels = audio.shape
    peak = float(np.abs(audio).max())
    rms = float(math.sqrt(float(np.mean(audio ** 2))))
    dc = float(np.mean(audio))
    finite = bool(np.isfinite(audio).all())
    silent = rms < 1e-6
    clipped = int((np.abs(audio) >= 0.999).sum())
    print("  file      : %s (%.1f MB)" % (path.name, path.stat().st_size / 2**20))
    print("  rate      : %d Hz, %d channel(s), subtype %s"
          % (rate, channels, sf.info(str(path)).subtype))
    print("  duration  : %.3f s (%d frames)" % (frames / rate, frames))
    print("  peak      : %.5f   rms: %.5f   dc: %+.2e" % (peak, rms, dc))
    print("  finite    : %s   near-clipping samples: %d" % (finite, clipped))
    if not finite:
        failures.append("non-finite samples")
    if silent:
        failures.append("silent audio")
    if clipped > frames:
        print("  note      : heavy clipping")

    # Coarse spectral sanity: real music spreads energy across bands; a stuck
    # or degenerate decode tends to park it in one.
    mono = audio.mean(axis=1)
    spectrum = np.abs(np.fft.rfft(mono * np.hanning(len(mono))))
    freqs = np.fft.rfftfreq(len(mono), 1.0 / rate)
    total = float(spectrum.sum()) or 1.0
    edges = [0, 200, 500, 2000, 6000, 12000, rate / 2]
    bands = []
    for low, high in zip(edges, edges[1:]):
        share = float(spectrum[(freqs >= low) & (freqs < high)].sum()) / total
        bands.append("%d-%dHz %.1f%%" % (low, high, share * 100))
    print("  spectrum  :", "  ".join(bands))
    centroid = float((spectrum * freqs).sum() / total)
    print("  centroid  : %.0f Hz" % centroid)

    print("\n=== 3. symbolic plan (score.abc) ===")
    score = directory / "score.abc"
    if score.is_file():
        text = score.read_text(encoding="utf-8")
        print("  %d bytes" % len(text))
        for line in text.splitlines()[:args.abc_lines]:
            print("  | " + line)
        if len(text.splitlines()) > args.abc_lines:
            print("  | ... (%d more lines)" % (len(text.splitlines()) - args.abc_lines))
    else:
        print("  (no score.abc -- cot may have been off)")

    print("\n=== 4. timing ===")
    timing = result.get("timing", {})
    for key in ("abc", "semantic"):
        stage = timing.get(key, {})
        if stage:
            print("  %-9s %7.1fs  %5d tokens  %.2f tok/s  %s"
                  % (key, stage.get("seconds", 0), stage.get("output_tokens", 0),
                     stage.get("output_tps", 0), stage.get("execution")))
    for key in ("nar_seconds", "vae_seconds", "e2e_seconds"):
        if key in timing:
            print("  %-9s %7.1fs" % (key, timing[key]))
    seconds = result.get("audio_seconds", 0)
    if seconds and timing.get("e2e_seconds"):
        print("  ratio     %.2f s per audio second" % (timing["e2e_seconds"] / seconds))

    print()
    if failures:
        print("FAILED:", ", ".join(failures))
        return 1
    print("VERIFIED: %s -- complete, hash-valid, %.1f s of finite audio at %d Hz"
          % (directory.name, frames / rate, rate))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
